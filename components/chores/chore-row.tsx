import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDue, formatFrequency, formatShortDate, isTask, type ChoreStatus } from '@/lib/chores';
import { CHORE_STATE_COLORS, choreInkColor } from './chore-colors';
import { useAuth } from '@/contexts/auth-context';
import { useFriends } from '@/contexts/friends-context';
import { isSharedChore, sharedNames } from '@/lib/chore-reminders';
import type { Chore } from '@/types/chore';

const GREEN = CHORE_STATE_COLORS.fresh;
/** How far the card's background tints toward green at the glow's peak. */
const GLOW_WASH = 0.22;
const CONFETTI = ['#2ECC71', '#F1C40F', '#3498DB', '#E74C3C', '#9B59B6', '#1ABC9C'];
const PARTICLES = 12;
/** How long the celebration plays in place before the write re-sorts the list. */
const SETTLE_MS = 450;
/**
 * Every motion here is eased timing, never a spring: the user found the
 * spring overshoot (rows bouncing into place) nauseating. Keep it that way.
 */
const SMOOTH = Easing.inOut(Easing.cubic);
/** Rows gliding to a new position after a re-sort. Shared with the screen's headers. */
export const CHORE_LAYOUT_TRANSITION = LinearTransition.duration(380).easing(SMOOTH);
/** How long the inline Undo stays on the row after a completion. */
export const CHORE_UNDO_MS = 5000;

type Props = {
  chore: Chore;
  status: ChoreStatus;
  today: string;
  /** Synchronous offline guard (alerts and returns false when offline). */
  canWrite: () => boolean;
  onDone: (date: string) => void;
  onUndo: (date: string) => void;
  onOpen: () => void;
  /**
   * Completed from the detail sheet just now (already written): the row
   * offers the same Undo as a check tap. `onDismiss` ends the offer (an
   * undo, or the screen's timer).
   */
  sheetDone?: { date: string; onDismiss: () => void } | null;
  /** The row's place in the list, so the screen can scroll it into view. */
  onLayout?: (e: LayoutChangeEvent) => void;
};

function Particle({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const angle = (index / PARTICLES) * Math.PI * 2 + (index % 2 ? 0.2 : 0);
  const distance = index % 2 ? 30 : 40;
  const size = index % 3 === 0 ? 7 : 5;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: p === 0 ? 0 : interpolate(p, [0, 0.15, 1], [0, 1, 0]),
      transform: [
        { translateX: Math.cos(angle) * distance * p },
        { translateY: Math.sin(angle) * distance * p + 10 * p * p },
        { scale: interpolate(p, [0, 0.3, 1], [0.4, 1.1, 0.6]) },
        { rotate: `${p * 180}deg` },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          width: size,
          height: index % 3 === 1 ? size * 1.8 : size,
          borderRadius: index % 3 === 0 ? size / 2 : 1.5,
          backgroundColor: CONFETTI[index % CONFETTI.length],
        },
        style,
      ]}
    />
  );
}

export function ChoreRow({ chore, status, today, canWrite, onDone, onUndo, onOpen, sheetDone, onLayout }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { nameOf } = useFriends();
  const uid = useAuth().user?.uid ?? '';
  const task = isTask(chore);
  // A task stays checked once done; a recurring chore only for today.
  const done = task ? status.state === 'done' : status.daysSince === 0;
  // Logged today (from the check, the sheet, or another device): the card
  // glows for the rest of the day, so today's wins stay lit in the list.
  const doneToday = task ? status.state === 'done' && chore.completions[0] === today : status.daysSince === 0;
  const stateColor = CHORE_STATE_COLORS[status.state];

  // The date this row just completed from its check, while its Undo is on
  // offer; a completion from the sheet offers Undo through `sheetDone`.
  const [checkUndoDate, setCheckUndoDate] = useState<string | null>(null);
  const undoDate = checkUndoDate ?? sheetDone?.date ?? null;
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrite = useRef<(() => void) | null>(null);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fill = useSharedValue(done ? 1 : 0);
  const pop = useSharedValue(1);
  const ring = useSharedValue(0);
  const burst = useSharedValue(0);
  const sweep = useSharedValue(0);
  const glow = useSharedValue(doneToday ? 1 : 0);

  // The glow follows the data: lights up when today's log lands (after
  // the check's own celebration, or as the sheet closes), goes out on an
  // undo or at the day's end. Eased timing only.
  useEffect(() => {
    glow.set(
      withTiming(doneToday ? 1 : 0, {
        duration: doneToday ? 320 : 600,
        easing: doneToday ? Easing.out(Easing.cubic) : SMOOTH,
      }),
    );
  }, [doneToday, glow]);

  // Track the real data: a completion arriving from elsewhere (or an undo)
  // fills/empties the check without the celebration.
  useEffect(() => {
    fill.set(withTiming(done ? 1 : 0, { duration: 220 }));
  }, [done, fill]);

  // Never drop a completion: if the row unmounts mid-celebration, write now.
  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      pendingWrite.current?.();
    },
    [],
  );

  function celebrate() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    fill.set(withTiming(1, { duration: 160 }));
    pop.set(withSequence(
      withTiming(1.12, { duration: 140, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 220, easing: SMOOTH }),
    ));
    ring.set(0);
    ring.set(withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    burst.set(0);
    burst.set(withTiming(1, { duration: 750, easing: Easing.out(Easing.quad) }));
    sweep.set(0);
    sweep.set(withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }

  function handleCheck() {
    if (done || pendingWrite.current) {
      Haptics.selectionAsync().catch(() => {});
      return;
    }
    if (!canWrite()) return;
    celebrate();
    // Let the celebration land in place, then write: the list re-sorts and
    // the row glides to its new section (layout transition below).
    const date = today;
    pendingWrite.current = () => {
      pendingWrite.current = null;
      onDone(date);
    };
    writeTimer.current = setTimeout(() => pendingWrite.current?.(), SETTLE_MS);
    setCheckUndoDate(date);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setCheckUndoDate(null), CHORE_UNDO_MS);
  }

  function handleUndo() {
    if (!undoDate) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (!checkUndoDate && sheetDone) {
      // A sheet completion is already written: take it back.
      onUndo(sheetDone.date);
      sheetDone.onDismiss();
      return;
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (writeTimer.current) clearTimeout(writeTimer.current);
    // Undo before the write landed: just cancel it.
    if (pendingWrite.current) {
      pendingWrite.current = null;
      fill.set(withTiming(0, { duration: 200 }));
    } else {
      onUndo(undoDate);
    }
    setCheckUndoDate(null);
  }

  const checkStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fill.value, [0, 1], ['rgba(0,0,0,0)', GREEN]),
    borderColor: interpolateColor(fill.value, [0, 1], [stateColor, GREEN]),
    transform: [{ scale: pop.value }],
  }));
  const checkMarkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(fill.value, [0, 1], [0.35, 1]),
    transform: [{ scale: interpolate(fill.value, [0, 1], [0.7, 1]) }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : interpolate(ring.value, [0, 1], [0.7, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [1, 2.3]) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(glow.value * GLOW_WASH, [0, 1], [colors.tileBackground, GREEN]),
    borderColor: interpolateColor(glow.value, [0, 1], [colors.tileBorder, GREEN]),
    shadowOpacity: glow.value * 0.6,
    elevation: glow.value * 10,
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: sweep.value === 0 ? 0 : interpolate(sweep.value, [0, 0.25, 1], [0.5, 0.4, 0]),
    transform: [{ scaleX: interpolate(sweep.value, [0, 0.35, 1], [0, 1, 1]) }],
  }));

  const due = chore.dueDate ? formatShortDate(chore.dueDate, today) : '';
  const details = chore.description?.trim();
  // The pill carries the timing; this only says what kind of thing it is.
  // Task: "Oct 12 · details", or "One time · Oct 12". Chore: its frequency
  // (when it was last done lives in the detail sheet).
  const sub = task
    ? details
      ? `${due} · ${details}`
      : `One time · ${due}`
    : formatFrequency(chore.frequencyDays);
  const withWho = isSharedChore(chore) ? ` · with ${sharedNames(chore, uid, nameOf)}` : '';

  return (
    <Animated.View
      layout={CHORE_LAYOUT_TRANSITION}
      onLayout={onLayout}
      style={[
        styles.card,
        { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder },
        glowStyle,
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: stateColor }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sweepClip]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.sweep, sweepStyle]} />
      </View>
      <Pressable
        style={styles.body}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${chore.name}, ${formatDue(status)}. Open details`}
      >
        {!!chore.emoji && <ThemedText style={styles.emoji}>{chore.emoji}</ThemedText>}
        {/* The name gets the full width and wraps as far as it needs; the
            status pill rides under it with the details instead of squeezing
            it. The details drop to their own line whole rather than wrapping
            mid-phrase. Nothing here truncates. */}
        <View style={[styles.text, status.state === 'done' && styles.finished]}>
          <ThemedText style={styles.name}>
            {chore.name}
          </ThemedText>
          <View style={styles.meta}>
            {undoDate ? (
              <Pressable
                onPress={handleUndo}
                hitSlop={10}
                style={[styles.pill, styles.undoPill, { borderColor: colors.icon }]}
                accessibilityRole="button"
                accessibilityLabel={`Undo ${chore.name}`}
              >
                <ThemedText style={[styles.pillText, { color: colors.text }]}>Undo</ThemedText>
              </Pressable>
            ) : (
              <View style={[styles.pill, { backgroundColor: `${stateColor}26` }]}>
                <ThemedText style={[styles.pillText, { color: choreInkColor(status.state, scheme) }]}>
                  {formatDue(status)}
                </ThemedText>
              </View>
            )}
            <ThemedText style={styles.sub}>
              {sub + withWho}
            </ThemedText>
          </View>
        </View>
      </Pressable>
      <View style={styles.checkWrap}>
        <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
        {Array.from({ length: PARTICLES }, (_, i) => (
          <Particle key={i} index={i} progress={burst} />
        ))}
        <Pressable
          onPress={handleCheck}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={
            done ? `${chore.name} done${task ? '' : ' today'}` : `Mark ${chore.name} done${task ? '' : ' today'}`
          }
        >
          <Animated.View style={[styles.check, checkStyle]}>
            <Animated.Text style={[styles.checkMark, { color: done || undoDate ? '#fff' : stateColor }, checkMarkStyle]}>
              ✓
            </Animated.Text>
          </Animated.View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const CHECK = 44;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    minHeight: 76,
    paddingRight: 14,
    // Only the glow lights these up (shadowOpacity animates from 0).
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
  },
  stripe: {
    alignSelf: 'stretch',
    width: 6,
    borderTopLeftRadius: 13,
    borderBottomLeftRadius: 13,
  },
  sweepClip: { borderRadius: 13, overflow: 'hidden' },
  sweep: { backgroundColor: GREEN, transformOrigin: 'right' },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 12,
    gap: 12,
  },
  // Fixed box so names line up down the list whatever the emoji's width.
  emoji: { width: 36, fontSize: 30, lineHeight: 36, textAlign: 'center' },
  text: { flex: 1, minWidth: 0 },
  finished: { opacity: 0.6 },
  name: { fontSize: 18, fontWeight: '700', lineHeight: 23 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, marginTop: 5 },
  sub: { fontSize: 14, opacity: 0.55, lineHeight: 19 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  undoPill: { borderWidth: 1 },
  pillText: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  checkWrap: { width: CHECK, height: CHECK, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: CHECK,
    height: CHECK,
    borderRadius: CHECK / 2,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { fontSize: 22, fontWeight: '900', lineHeight: 26 },
  ring: {
    position: 'absolute',
    width: CHECK,
    height: CHECK,
    borderRadius: CHECK / 2,
    borderWidth: 3,
    borderColor: GREEN,
  },
  particle: { position: 'absolute' },
});
