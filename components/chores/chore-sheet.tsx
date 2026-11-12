import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { DateCalendar } from '@/components/chores/date-calendar';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addDays, parseDate } from '@/lib/date-utils';
import { choreStatus, completionIsWin, formatDue, formatFrequency, formatShortDate, formatSince, isTask } from '@/lib/chores';
import { CHORE_STATE_COLORS, choreInkColor } from './chore-colors';
import { useAuth } from '@/contexts/auth-context';
import { useFriends } from '@/contexts/friends-context';
import { isSharedChore, sharedNames } from '@/lib/chore-reminders';
import type { Chore } from '@/types/chore';

/** Days offered for logging (today and back): today and yesterday as big buttons, the rest as chips. */
const CHIP_DAYS = 60;
/** Today and yesterday get their own buttons; the strip starts the day before. */
const QUICK_DAYS = 2;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** How long the tapped control shows its win before the sheet leaves. */
const WIN_MS = 420;
/** Eased only, never a spring (bouncing reads as nauseating here). */
const SMOOTH = Easing.inOut(Easing.cubic);

type Props = {
  chore: Chore | null;
  today: string;
  onClose: () => void;
  /** Toggle a day: logs it when absent, removes it when present. */
  onToggleDate: (date: string, done: boolean) => void;
  /**
   * A win: a due, overdue or soon chore logged back off the docket. The
   * sheet has already celebrated; the screen writes it, closes the sheet
   * and shows the row.
   */
  onComplete: (date: string) => void;
  onEdit: () => void;
};

function shortDate(date: string): string {
  return parseDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function weekdayDate(date: string): string {
  return parseDate(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Detail sheet for one chore: log when it was done, and tap again to remove,
 * so logging and undoing live on the same control. Today and yesterday are
 * nearly every log, so they lead as big buttons (Today biggest, first), then
 * older days (back to 60) as a chip strip in calendar order, and any day at
 * all through a calendar (a quarterly or yearly chore is often logged months
 * back). A one-time task shows its details and one done / not done toggle
 * instead, with the same calendar for a day other than today.
 *
 * Logging a day on a chore that needs attention is a win, and a win ends
 * the visit: the tapped control fills green, then the sheet closes and the
 * screen shows the row (no extra Close tap). On a chore that is already
 * fresh or done, every tap is bookkeeping and the sheet stays put.
 */
export function ChoreSheet({ chore, today, onClose, onToggleDate, onComplete, onEdit }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { nameOf } = useFriends();
  const uid = useAuth().user?.uid ?? '';

  // Calendar order: oldest on the left, 2 days ago on the right. The strip
  // opens scrolled to the end so the most recent days are in view.
  const days = useMemo(
    () => Array.from({ length: CHIP_DAYS - QUICK_DAYS }, (_, i) => addDays(today, i - (CHIP_DAYS - 1))),
    [today],
  );
  const stripRef = useRef<ScrollView>(null);
  const yesterday = addDays(today, -1);
  const doneSet = useMemo(() => new Set(chore?.completions ?? []), [chore]);
  const oldest = days[0];
  const older = (chore?.completions ?? []).filter((d) => d < oldest);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The day just logged as a win, shown done while the sheet lingers.
  const [winDate, setWinDate] = useState<string | null>(null);
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (winTimer.current) clearTimeout(winTimer.current);
  }, []);

  if (!chore) return null;
  const status = choreStatus(chore, today);
  const stateColor = CHORE_STATE_COLORS[status.state];
  const task = isTask(chore);
  const doneOn = chore.completions[0];
  const details = chore.description?.trim();

  function toggle(date: string) {
    if (winDate) return;
    if (chore && completionIsWin(chore, date, today)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setWinDate(date);
      winTimer.current = setTimeout(() => {
        winTimer.current = null;
        setWinDate(null);
        onComplete(date);
      }, WIN_MS);
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    onToggleDate(date, doneSet.has(date));
  }
  const isDone = (date: string) => doneSet.has(date) || winDate === date;

  // A calendar pick is the same toggle as a chip tap; the calendar closes so
  // the result shows on the strip (or in the Earlier row).
  function pickDate(date: string) {
    setPickerOpen(false);
    toggle(date);
  }

  // The sheet stays mounted between chores: don't carry an open picker over.
  function close() {
    if (winDate) return; // the win closes it in a moment
    setPickerOpen(false);
    onClose();
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.tileBackground, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.tileBorder }]} />
        <View style={styles.titleRow}>
          {!!chore.emoji && <ThemedText style={styles.emoji}>{chore.emoji}</ThemedText>}
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.title}>
              {chore.name}
            </ThemedText>
            <ThemedText style={styles.sub}>
              {task
                ? `One time · Due ${chore.dueDate ? formatShortDate(chore.dueDate, today) : 'anytime'}`
                : status.unscheduled
                  ? formatFrequency(chore.frequencyDays) // the pill already says how long it's been
                  : `${formatFrequency(chore.frequencyDays)} · Last: ${
                      status.daysSince == null ? 'never' : formatSince(status.daysSince).toLowerCase()
                    }`}
            </ThemedText>
            {isSharedChore(chore) && (
              <ThemedText style={styles.sub}>
                {`Shared with ${sharedNames(chore, uid, nameOf)}${
                  doneOn && chore.lastDoneBy ? ` · last done by ${chore.lastDoneBy === uid ? 'you' : nameOf(chore.lastDoneBy)}` : ''
                }`}
              </ThemedText>
            )}
            {/* Under the details, not beside the name: the name gets the width. */}
            <View style={[styles.pill, { backgroundColor: `${stateColor}26` }]}>
              <ThemedText style={[styles.pillText, { color: choreInkColor(status.state, scheme) }]}>
                {formatDue(status)}
              </ThemedText>
            </View>
          </View>
        </View>

        {task ? (
          <>
            {!!details && <ThemedText style={styles.details}>{details}</ThemedText>}
            <Pop active={winDate != null}>
              <Pressable
                onPress={() => toggle(doneOn ?? today)}
                accessibilityRole="button"
                style={[
                  styles.taskToggle,
                  doneOn
                    ? { borderColor: colors.tileBorder }
                    : { borderColor: CHORE_STATE_COLORS.fresh, backgroundColor: CHORE_STATE_COLORS.fresh },
                  winDate != null && { borderColor: CHORE_STATE_COLORS.done, backgroundColor: CHORE_STATE_COLORS.done },
                ]}
              >
                <ThemedText style={[styles.taskToggleText, !doneOn && styles.chipTextDone]}>
                  {winDate != null ? '✓ Done' : doneOn ? 'Mark not done' : '✓ Mark done'}
                </ThemedText>
              </Pressable>
            </Pop>
            {!doneOn && (
              <Pressable onPress={() => setPickerOpen(true)} style={styles.pickDate} accessibilityRole="button">
                <ThemedText style={[styles.pickDateText, { color: colors.tint }]}>Done on another day</ThemedText>
              </Pressable>
            )}
          </>
        ) : (
          <>
            <ThemedText style={styles.label}>When was it done?</ThemedText>
            <ThemedText style={styles.hint}>Tap a day to log it. Tap again to remove it.</ThemedText>
            <QuickDay
              label="Today"
              date={today}
              done={isDone(today)}
              pop={winDate === today}
              size="large"
              onPress={() => toggle(today)}
            />
            <QuickDay
              label="Yesterday"
              date={yesterday}
              done={isDone(yesterday)}
              pop={winDate === yesterday}
              size="medium"
              onPress={() => toggle(yesterday)}
            />
            <ScrollView
              ref={stripRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              onContentSizeChange={() => stripRef.current?.scrollToEnd({ animated: false })}
            >
              {days.map((date) => {
                const done = isDone(date);
                const d = parseDate(date);
                return (
                  <Pop key={date} active={winDate === date}>
                    <Pressable
                      onPress={() => toggle(date)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: done }}
                      accessibilityLabel={`${shortDate(date)}${done ? ', done' : ''}`}
                      style={[
                        styles.chip,
                        { borderColor: done ? CHORE_STATE_COLORS.fresh : colors.tileBorder },
                        done && { backgroundColor: CHORE_STATE_COLORS.fresh },
                      ]}
                    >
                      <ThemedText style={[styles.chipTop, done && styles.chipTextDone]}>{WEEKDAYS[d.getDay()]}</ThemedText>
                      <ThemedText style={[styles.chipDay, done && styles.chipTextDone]}>{d.getDate()}</ThemedText>
                      <ThemedText style={[styles.chipTop, done && styles.chipTextDone]}>
                        {done ? '✓' : d.toLocaleDateString(undefined, { month: 'short' })}
                      </ThemedText>
                    </Pressable>
                  </Pop>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setPickerOpen(true)} style={styles.pickDate} accessibilityRole="button">
              <ThemedText style={[styles.pickDateText, { color: colors.tint }]}>Pick a date</ThemedText>
            </Pressable>

            {older.length > 0 && (
              <View style={styles.olderRow}>
                <ThemedText style={styles.hint}>Earlier:</ThemedText>
                {older.map((date) => (
                  <Pressable
                    key={date}
                    onPress={() => toggle(date)}
                    style={[styles.olderChip, { borderColor: colors.tileBorder }]}
                    accessibilityLabel={`Remove ${shortDate(date)}`}
                  >
                    <ThemedText style={styles.olderText}>{shortDate(date)} ✕</ThemedText>
                  </Pressable>
                ))}
              </View>
            )}

          </>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.secondary, { borderColor: colors.tileBorder }]}
            onPress={onEdit}
            accessibilityRole="button"
          >
            <ThemedText style={styles.secondaryText}>{task ? 'Edit task' : 'Edit chore'}</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.secondary, { borderColor: colors.tileBorder }]}
            onPress={close}
            accessibilityRole="button"
          >
            <ThemedText style={styles.secondaryText}>Close</ThemedText>
          </Pressable>
        </View>
      </View>
      <DatePickerDialog
        visible={pickerOpen}
        title={task ? 'When was it done?' : 'Pick a date'}
        hint={task ? 'Tap the day it was done.' : 'Tap a day to log it. Tap a logged day to remove it.'}
        today={today}
        onPick={pickDate}
        onClose={() => setPickerOpen(false)}
      />
    </Modal>
  );
}

/**
 * The month calendar in its own small dialog over the sheet (the sheet has
 * no scroll, so the calendar can't live inline on a short phone). One pick
 * toggles that day and closes it.
 */
function DatePickerDialog({
  visible,
  title,
  hint,
  today,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  hint: string;
  today: string;
  onPick: (date: string) => void;
  onClose: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.dialog, { backgroundColor: colors.tileBackground }]}>
          <ThemedText style={styles.dialogTitle}>{title}</ThemedText>
          <ThemedText style={styles.hint}>{hint}</ThemedText>
          <DateCalendar value={today} today={today} max={today} onChange={onPick} />
          <Pressable
            style={[styles.secondary, styles.dialogCancel, { borderColor: colors.tileBorder }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <ThemedText style={styles.secondaryText}>Cancel</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * A full-width day button: outlined until logged, then filled green with a
 * check (same language as the chips). Tapping a logged day removes it.
 */
function QuickDay({
  label,
  date,
  done,
  pop,
  size,
  onPress,
}: {
  label: string;
  date: string;
  done: boolean;
  /** Just logged as a win: swell once as it fills. */
  pop: boolean;
  size: 'large' | 'medium';
  onPress: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const large = size === 'large';
  return (
    <Pop active={pop}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: done }}
        accessibilityLabel={`${label}, ${shortDate(date)}${done ? ', done. Tap to remove' : ''}`}
        style={({ pressed }) => [
          styles.quick,
          large ? styles.quickLarge : styles.quickMedium,
          { borderColor: done ? CHORE_STATE_COLORS.fresh : Colors[scheme].tileBorder },
          done && { backgroundColor: CHORE_STATE_COLORS.fresh },
          pressed && styles.quickPressed,
        ]}
      >
        <ThemedText
          style={[large ? styles.quickLabelLarge : styles.quickLabelMedium, done && styles.chipTextDone]}
        >
          {done ? `✓ ${label}` : label}
        </ThemedText>
        <ThemedText style={[styles.quickSub, done && styles.chipTextDone]}>
          {pop ? 'Done' : done ? 'Done · tap to remove' : weekdayDate(date)}
        </ThemedText>
      </Pressable>
    </Pop>
  );
}

/**
 * Swells its child once (eased out and back, no overshoot) when `active`
 * turns on: the control the user just tapped reacts where they are looking
 * before the sheet leaves.
 */
function Pop({ active, style, children }: { active: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!active) return;
    scale.set(
      withSequence(
        withTiming(1.06, { duration: 160, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 240, easing: SMOOTH }),
      ),
    );
  }, [active, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  emoji: { fontSize: 36, lineHeight: 44 },
  title: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  sub: { fontSize: 13, opacity: 0.6 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 8 },
  pillText: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  label: { fontSize: 15, fontWeight: '600', marginTop: 20 },
  details: { fontSize: 15, lineHeight: 21, marginTop: 16, opacity: 0.85 },
  taskToggle: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  taskToggleText: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, opacity: 0.55 },
  chips: { gap: 8, paddingVertical: 12 },
  chip: {
    width: 52,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  chipTop: { fontSize: 11, opacity: 0.7, lineHeight: 14 },
  chipDay: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  chipTextDone: { color: '#fff', opacity: 1 },
  pickDate: { alignSelf: 'flex-start', paddingVertical: 6 },
  pickDateText: { fontSize: 14, fontWeight: '600' },
  dialogOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 24,
  },
  dialog: { width: '100%', maxWidth: 360, borderRadius: 16, padding: 16 },
  dialogTitle: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  dialogCancel: { flex: 0, marginTop: 12 },
  olderRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  olderChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  olderText: { fontSize: 12 },
  quick: { borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickLarge: { minHeight: 76, borderWidth: 1.5, marginTop: 14 },
  quickMedium: { minHeight: 56, borderWidth: 1.5, marginTop: 10 },
  quickPressed: { opacity: 0.7 },
  quickLabelMedium: { fontSize: 17, fontWeight: '700', lineHeight: 22 },
  quickLabelLarge: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  quickSub: { fontSize: 12, opacity: 0.6, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
});
