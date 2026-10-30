import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { TileContent } from '@/components/habits/tile-content';
import { HoloFoil, HOLO_COLORS } from './holo-foil';
import { BadgePatch, STATUS_LABELS, StatusMark } from './badge-patch';
import { BadgeEarnedModal, type EarnedBadge } from './badge-earned-modal';
import { Colors, QuestColors } from '@/constants/theme';
import { useHabitQuest } from '@/contexts/habit-quest-context';
import { useHabits } from '@/hooks/use-habits';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyDates } from '@/hooks/use-win-only-dates';
import { useTodayDate } from '@/hooks/use-today-date';
import { useHabitQuestProgress } from '@/hooks/use-habit-quest-progress';
import { useEarnedBadges, useHabitBadges, type HabitBadge } from '@/hooks/use-habit-badges';
import { designForNumber } from '@/lib/badge-designs';
import { useRecordsContext } from '@/contexts/records-context';
import { QUEST_LENGTH, creditedQuest, questEndDate, type QuestDay, type QuestProgress } from '@/lib/habit-quest';
import { addDays, formatDate, parseDate } from '@/lib/date-utils';
import { MAINTENANCE_WINDOW_DAYS, STRENGTH_LINE } from '@/lib/habit-strength';
import { DECAY_DAYS, FORMATION_DAYS } from '@/lib/habit-strength';
import type { Habit } from '@/types/habit';
import type { HabitQuest } from '@/types/habit-quest';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(date: string): string {
  const d = parseDate(date);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const HOLO_INK = '#7FE9FF';
const COLS = 10;

/**
 * THE 60-DAY QUEST: the top of the Quests tab. One habit at a time, 60 days
 * at a time; every recorded day counts at any level and a miss resets
 * nothing. Its own feature on its own collection, unrelated to the scored
 * challenges and run score below it.
 */
/** Where the Read more pill lands after Show less, when it has to scroll back: just under the top, list in view. */
const REVEAL_OFFSET = 44;

type RevealInScroll = (target: View | null, offset: number) => void;

type NewBadge = Omit<EarnedBadge, 'key' | 'design'>;

/** The Begin button, raised to the screen so it can stick to the bottom while the real one is off screen. */
export type StickyBegin = { label: string; onPress: () => void; contentY: number; height: number };
export type StickyBeginApi = {
  /** Where a view sits in the scroll content (y, height). */
  measure: (view: View, done: (contentY: number, height: number) => void) => void;
  set: (begin: StickyBegin | null) => void;
};

/** The holo action button: Begin 60 days, Take your badge. Also used for the sticky copy. */
export function HoloActionButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      style={[styles.beginButton, disabled && styles.beginDisabled]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {!disabled && (
        <LinearGradient colors={HOLO_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <Text style={[styles.beginText, disabled && { color: QuestColors.textDim }]}>{label}</Text>
    </Pressable>
  );
}

export function SixtyDayQuest({
  revealInScroll,
  stickyBegin,
}: {
  revealInScroll?: RevealInScroll;
  stickyBegin?: StickyBeginApi;
}) {
  const { activeQuest } = useHabitQuest();
  const { habit, progress } = useHabitQuestProgress();
  const [earned, setEarned] = useState<EarnedBadge | null>(null);
  const numbered = useEarnedBadges();
  // The badge just earned is the next one in the preselected sequence.
  const onEarned = (badge: NewBadge) =>
    setEarned({ ...badge, key: Date.now(), design: designForNumber(numbered.length + 1) });

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <LinearGradient
          colors={HOLO_COLORS}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.titleBar}
        />
        <ThemedText style={styles.title}>THE 60-DAY QUEST</ThemedText>
      </View>
      <ThemedText style={styles.lede}>
        Two months is the median time to form a new habit. Take on one habit at a time, 60 days
        at a time.
      </ThemedText>

      {activeQuest && progress ? (
        <ActiveQuest quest={activeQuest} habit={habit} progress={progress} onEarned={onEarned} />
      ) : (
        <StartQuest revealInScroll={revealInScroll} stickyBegin={stickyBegin} onEarned={onEarned} />
      )}

      <YourBadges />
      <BadgeEarnedModal earned={earned} onClose={() => setEarned(null)} />
    </View>
  );
}

/** Rule text line height: the first line of the missed-day rule shows in full while collapsed. */
const RULE_LINE = 19;
/** Faded strip below that line, where the Read more pill sits over the text. */
const RULES_FADE = 40;

/**
 * The rules, collapsed by default so they don't bury the habit list: the
 * first three and the first line of the missed-day rule show in full, the
 * text below fades out, and a centered Read more pill sits over the fade.
 * Open, a centered Show less sits under the text.
 */
function CollapsibleRules({ revealInScroll }: { revealInScroll?: RevealInScroll }) {
  const [open, setOpen] = useState(false);
  const [peekY, setPeekY] = useState<number | null>(null);
  const collapsed = !open && peekY != null;
  // Show less shrinks the text above the habit list; once the collapsed
  // pill is laid out, bring it back on screen if it ended up above it.
  const pillRef = useRef<View>(null);
  const justCollapsedRef = useRef(false);
  return (
    <View>
      <View style={collapsed ? { height: peekY + RULE_LINE + RULES_FADE, overflow: 'hidden' } : null}>
        {collapsed ? (
          // Fade the text itself (a mask), not a dark box painted over the foil.
          <MaskedView
            maskElement={
              <View style={StyleSheet.absoluteFill}>
                <View style={{ height: peekY + RULE_LINE, backgroundColor: '#000' }} />
                <LinearGradient colors={['#000', 'rgba(0,0,0,0.25)', 'transparent']} style={{ height: RULES_FADE }} />
              </View>
            }
          >
            <Rules onPeekY={setPeekY} />
          </MaskedView>
        ) : (
          <Rules onPeekY={setPeekY} />
        )}
        {collapsed && (
          <View
            ref={pillRef}
            style={styles.readMoreOverlay}
            pointerEvents="box-none"
            onLayout={() => {
              if (!justCollapsedRef.current) return;
              justCollapsedRef.current = false;
              revealInScroll?.(pillRef.current, REVEAL_OFFSET);
            }}
          >
            <ReadMorePill open={false} onPress={() => setOpen(true)} />
          </View>
        )}
      </View>
      {open && (
        <View style={styles.showLessRow}>
          <ReadMorePill
            open
            onPress={() => {
              justCollapsedRef.current = true;
              setOpen(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

function ReadMorePill({ open, onPress }: { open: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.readMorePill, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Show less of the rules' : 'Read more of the rules'}
    >
      <Text style={styles.readMoreText}>{open ? 'Show less' : 'Read more'}</Text>
      <Svg width={10} height={10} viewBox="0 0 10 10" style={open ? styles.chevronUp : undefined}>
        <Path d="M2 3.5 L5 6.5 L8 3.5" stroke={HOLO_INK} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </Pressable>
  );
}

function Rules({ onPeekY }: { onPeekY?: (y: number) => void }) {
  return (
    <View style={styles.rules}>
      <Rule>Every day you record the habit counts, at any level. Basic, goal, or ideal.</Rule>
      <Rule>
        <Term>Habit strength</Term> scores how automatic the habit is getting, from 0 to 100%,
        counting your history from before the quest. Each day you show up builds it. Each day you
        skip, it fades, a bit faster than it builds. It&apos;s averaged over the last 7 days, so a
        day off doesn&apos;t swing it.
      </Rule>
      <Rule>
        <Term>50%</Term> habit strength is the line that matters. Doing the habit about 5 days a
        week holds it.
      </Rule>
      <Rule onLayout={onPeekY ? (e) => onPeekY(e.nativeEvent.layout.y) : undefined}>
        A missed day here and there is fine. The quest restarts at day 1 after a full week with
        nothing, after a full week under 50% once you&apos;ve reached it, or as soon as 50% by
        day 60 is out of reach even doing it every day. A restart keeps any stretch you&apos;d
        kept up right before it.
      </Rule>
      <Rule>
        Vacation and win-only days you skip don&apos;t use up any of the 60. Day 60 moves out
        to make up for them.
      </Rule>
      <Rule>
        One quest at a time. Reach day 60 at 50% or more and you earn a badge on the habit.
      </Rule>
      <Rule>
        Already doing it? When you pick a habit, day 1 goes back as far as a quest started then
        would have run without restarting, up to 60 days. A habit with all 60 shines in the list
        below, and picking it earns you a badge on it right away.
      </Rule>
      <Rule>
        After that, a small mark next to the badge shows how it&apos;s holding up: rising while
        it&apos;s <Term>strong</Term> (50% or more), a wave while it&apos;s <Term>kept up</Term> (20% or
        more, about 3 days a week), falling once it&apos;s <Term>in remission</Term> (a full week
        under 20%).
      </Rule>
      <ThemedText style={styles.research}>
        Habit strength follows a published habit-learning model (Klein et al., 2011). Daily practice
        reaches 95% in {FORMATION_DAYS} days, the median Lally et al. (2010) measured; a 2024
        review found 59 to 66. With no practice, it fades over about {DECAY_DAYS} days, inside
        the 1 to 65 days habit decay took in Edgren et al. (2025). One missed day didn&apos;t
        derail anyone in Lally&apos;s study. Very inconsistent people never formed the habit, but
        no study names a cut-off for too low, so the 50% and 20% lines are read off this model.
      </ThemedText>
    </View>
  );
}

function Rule({ children, onLayout }: { children: ReactNode; onLayout?: (e: LayoutChangeEvent) => void }) {
  return (
    <View style={styles.ruleRow} onLayout={onLayout}>
      <Text style={styles.ruleMark}>✦</Text>
      <ThemedText style={styles.ruleText}>{children}</ThemedText>
    </View>
  );
}

/** A named measure (like habit strength), set apart so it reads as a term. */
function Term({ children }: { children: ReactNode }) {
  return <Text style={styles.term}>{children}</Text>;
}

// ---------- Not started: the pitch + habit picker ----------

function StartQuest({
  revealInScroll,
  stickyBegin,
  onEarned,
}: {
  revealInScroll?: RevealInScroll;
  stickyBegin?: StickyBeginApi;
  onEarned: (badge: NewBadge) => void;
}) {
  const { habits } = useHabits();
  const { startQuest, pastQuests } = useHabitQuest();
  const { todayStr } = useTodayDate();
  const { recordsMap, loadedRange, ensureRange } = useRecordsContext();
  const { dateSet } = useVacationDays();
  const winOnly = useWinOnlyDates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = habits.find((h) => h.id === selectedId) ?? null;

  // A habit whose last 60 days already pass earns the badge when picked, so
  // those days must be loaded before Begin can decide.
  // Credit looks back up to 60 days, and habit strength on day 1 needs the
  // history before that.
  const windowStart = addDays(todayStr, -QUEST_LENGTH - MAINTENANCE_WINDOW_DAYS);
  useEffect(() => {
    ensureRange(windowStart, todayStr);
  }, [windowStart, todayStr, ensureRange]);
  const windowLoaded = !!loadedRange && loadedRange.start <= windowStart && loadedRange.end >= todayStr;

  // Day 60 of each habit's latest badge: those days can't earn another.
  const lastBadgeEnd = useMemo(() => {
    const ends = new Map<string, string>();
    for (const q of pastQuests) {
      const end = q.endDate ?? questEndDate(q.startDate);
      if (end > (ends.get(q.habitId) ?? '')) ends.set(q.habitId, end);
    }
    return ends;
  }, [pastQuests]);

  // What's already been kept up counts: each habit's quest would start that
  // far back. Worked out for every habit so the ones that already pass can
  // shine in the list before they're picked.
  const credits = useMemo(() => {
    const out = new Map<string, ReturnType<typeof creditedQuest>>();
    if (!windowLoaded) return out;
    for (const h of habits) {
      out.set(
        h.id,
        creditedQuest({
          today: todayStr,
          habit: h,
          getRecord: (date) => recordsMap.get(`${h.id}_${date}`),
          vacationDates: dateSet,
          winOnlyDates: winOnly,
          notBefore: lastBadgeEnd.get(h.id),
        }),
      );
    }
    return out;
  }, [habits, windowLoaded, todayStr, recordsMap, dateSet, winOnly, lastBadgeEnd]);
  // A habit with a badge moves to Your badges, out of this list, unless it
  // has slid into remission: then another quest is how it gets rebuilt.
  const badges = useHabitBadges();
  const pickable = habits.filter((h) => {
    const b = badges.get(h.id);
    return !b || b.status === 'remission';
  });
  const credit = selected ? (credits.get(selected.id) ?? null) : null;
  const badgeReady = !!credit?.progress.earnedBadge;

  function begin() {
    if (!selected || !credit) return;
    const { progress } = credit;
    if (progress.earnedBadge) {
      startQuest(selected, todayStr, {
        attemptStart: progress.attemptStart,
        endDate: progress.endDate,
        daysDone: progress.doneCount,
        strength: progress.strength,
      });
      onEarned({ habitName: selected.name, daysDone: progress.doneCount, strength: progress.strength });
      setSelectedId(null);
    } else {
      startQuest(selected, credit.startDate);
    }
  }

  const beginLabel = !selected
    ? 'BEGIN 60 DAYS'
    : badgeReady
      ? `TAKE YOUR ${selected.name.toUpperCase()} BADGE`
      : `BEGIN 60 DAYS OF ${selected.name.toUpperCase()}`;

  // With a habit picked, the Begin button sticks to the bottom of the screen
  // while the real one is scrolled out of view (the screen decides; this
  // reports where the real one sits). Nothing picked: nothing sticks.
  const beginViewRef = useRef<View>(null);
  const beginRef = useRef(begin);
  beginRef.current = begin;
  const canBegin = !!selected && windowLoaded;
  const reportSticky = () => {
    const view = beginViewRef.current;
    if (!stickyBegin) return;
    if (!canBegin || !view) {
      stickyBegin.set(null);
      return;
    }
    stickyBegin.measure(view, (contentY, height) =>
      stickyBegin.set({ label: beginLabel, onPress: () => beginRef.current(), contentY, height }),
    );
  };
  useEffect(() => {
    reportSticky();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-report when what the button says or does changes
  }, [canBegin, beginLabel]);
  useEffect(() => () => stickyBegin?.set(null), [stickyBegin]);

  let beginHint: string | null = null;
  if (badgeReady && selected) {
    beginHint = `${selected.name} shines because its last 60 days already pass: you've earned a badge on it. Take it, then pick a habit for your quest.`;
  } else if (credit && credit.creditedDays > 0) {
    beginHint = `Your last ${credit.creditedDays} day${credit.creditedDays === 1 ? '' : 's'} count, so you start on day ${
      credit.creditedDays + 1
    }. Day 60 is ${shortDate(credit.progress.endDate)}.`;
  } else if (selected) {
    beginHint = `Day 1 is today. Day 60 is ${shortDate(credit?.progress.endDate ?? questEndDate(todayStr))}.`;
  }

  return (
    <View style={styles.startCard}>
      <HoloFoil variant="tile" />
      <CollapsibleRules revealInScroll={revealInScroll} />
      <ThemedText style={styles.pickLabel}>CHOOSE ONE HABIT</ThemedText>
      {pickable.length === 0 ? (
        <ThemedText style={styles.emptyText}>
          {habits.length === 0
            ? 'Add a habit on the Habits tab first.'
            : 'Every habit has a badge. Add a habit on the Habits tab for a new quest.'}
        </ThemedText>
      ) : (
        <View style={styles.pickList}>
          {pickable.map((h) => {
            const on = h.id === selectedId;
            // Already passes: the badge is waiting. Shown in holo foil.
            const ready = !!credits.get(h.id)?.progress.earnedBadge;
            return (
              <Pressable
                key={h.id}
                style={[
                  styles.pickRow,
                  ready && styles.pickRowReady,
                  on && { borderColor: HOLO_INK, backgroundColor: 'rgba(127,233,255,0.08)' },
                ]}
                onPress={() => setSelectedId(on ? null : h.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={ready ? `${h.name}, badge ready` : h.name}
              >
                {ready && <HoloFoil variant="card" />}
                <View style={[styles.pickDot, { backgroundColor: h.color }]} />
                <ThemedText style={styles.pickName} numberOfLines={1}>
                  {h.name}
                </ThemedText>
                {ready && <Text style={styles.readyTag}>BADGE READY</Text>}
                {!ready && badges.get(h.id)?.status === 'remission' && (
                  <Text style={[styles.readyTag, { color: STATUS_LABELS.remission.ink }]}>IN REMISSION</Text>
                )}
                <View style={[styles.radio, on && { borderColor: HOLO_INK }]}>
                  {on && <View style={styles.radioFill} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      <View ref={beginViewRef} onLayout={reportSticky}>
        <HoloActionButton
          label={beginLabel}
          onPress={() => beginRef.current()}
          disabled={!selected || !windowLoaded}
          accessibilityLabel={badgeReady && selected ? `Take your ${selected.name} badge` : 'Begin 60 days'}
        />
      </View>
      {beginHint && <ThemedText style={[styles.beginHint, badgeReady && styles.readyHint]}>{beginHint}</ThemedText>}
    </View>
  );
}

// ---------- Running or finished ----------

function ActiveQuest({
  quest,
  habit,
  progress,
  onEarned,
}: {
  quest: HabitQuest;
  habit?: Habit;
  progress: QuestProgress;
  onEarned: (badge: NewBadge) => void;
}) {
  const { abandonQuest, finishQuest } = useHabitQuest();
  const [whyOpen, setWhyOpen] = useState(false);

  const confirmAbandon = () =>
    Alert.alert(
      'Abandon this quest?',
      `Your 60-day progress on ${quest.habitName} is cleared. Your habit records stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Abandon', style: 'destructive', onPress: abandonQuest },
      ],
    );

  return (
    <View style={styles.activeWrap}>
      <HoloCard quest={quest} habit={habit} progress={progress} />

      {!habit && !progress.isOver && (
        <ThemedText style={styles.goneText}>
          This habit was deleted or archived, so new days can&apos;t count. Abandon the quest to
          choose another.
        </ThemedText>
      )}

      <DayGrid days={progress.days} color={quest.habitColor} />
      <View style={styles.legend}>
        <LegendSwatch kind="done" label="Recorded" color={quest.habitColor} />
        <LegendSwatch kind="missed" label="Missed" />
        <LegendSwatch kind="vacation" label="Vacation" />
        {progress.days.some((d) => d.state === 'winOnly') && <LegendSwatch kind="winOnly" label="Win-only" />}
      </View>
      <ThemedText style={styles.dates}>
        {`Day 1 ${shortDate(progress.attemptStart)} · Day 60 ${shortDate(progress.endDate)}`}
      </ThemedText>
      {progress.restartedOn && (
        <ThemedText style={styles.restartText}>{restartNote(progress)}</ThemedText>
      )}

      {progress.isOver && (
        <Pressable
          style={styles.beginButton}
          onPress={() => {
            finishQuest({
              attemptStart: progress.attemptStart,
        endDate: progress.endDate,
              daysDone: progress.doneCount,
              strength: progress.strength,
            });
            if (progress.earnedBadge) {
              onEarned({
                habitName: habit?.name ?? quest.habitName,
                daysDone: progress.doneCount,
                strength: progress.strength,
              });
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Choose the next habit"
        >
          <LinearGradient colors={HOLO_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.beginText}>CHOOSE THE NEXT HABIT</Text>
        </Pressable>
      )}

      <Pressable
        style={styles.whyCard}
        onPress={() => setWhyOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={whyOpen ? 'Hide why 60 days' : 'Show why 60 days'}
      >
        <View style={styles.whyHeader}>
          <ThemedText style={styles.whyLabel}>WHY 60 DAYS</ThemedText>
          <ThemedText style={styles.whyChevron}>{whyOpen ? '▾' : '▸'}</ThemedText>
        </View>
        {whyOpen && <Rules />}
      </Pressable>

      {!progress.isOver && (
        <Pressable onPress={confirmAbandon} hitSlop={8} style={styles.abandon} accessibilityRole="button">
          <ThemedText style={styles.abandonText}>Abandon quest</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

/** Why the quest restarted, and what it kept: "Restarted Nov 23 after ... The 9 days you'd kept up still count." */
function restartNote(progress: QuestProgress): string {
  const on = progress.restartedOn!;
  const why =
    progress.restartReason === 'weekUnder'
      ? 'a full week under 50%'
      : progress.restartReason === 'cantWin'
        ? 'day 60 could no longer reach 50%'
        : 'a full week with nothing';
  // Day 1 moved back into the kept-up stretch, or it's simply the next day.
  if (progress.attemptStart <= on) {
    const kept = progress.days.filter((d) => d.date <= on && d.dayNumber != null).length;
    return `Restarted ${shortDate(on)} after ${why}. The ${kept} days you'd kept up still count. Attempt ${progress.attemptNumber}.`;
  }
  return `Restarted ${shortDate(progress.attemptStart)} after ${why}. Attempt ${progress.attemptNumber}.`;
}

/**
 * The quest habit as a holo trading card. Touch and drag across it to tilt
 * it and catch the light; it eases flat again on release (timing, no spring).
 */
function HoloCard({ quest, habit, progress }: { quest: HabitQuest; habit?: Habit; progress: QuestProgress }) {
  // The reactive map, not getRecordForDay: that reads a ref, which a
  // compiler-memoized render would serve stale.
  const { recordsMap } = useRecordsContext();
  const { todayStr } = useTodayDate();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const px = useSharedValue(-1);
  const py = useSharedValue(-1);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);

  const track = (e: GestureResponderEvent, ease: number) => {
    if (!size.w || !size.h) return;
    const x = Math.min(1, Math.max(0, e.nativeEvent.locationX / size.w));
    const y = Math.min(1, Math.max(0, e.nativeEvent.locationY / size.h));
    px.set(x);
    py.set(y);
    tiltY.set(withTiming((x - 0.5) * 14, { duration: ease, easing: Easing.out(Easing.cubic) }));
    tiltX.set(withTiming((0.5 - y) * 10, { duration: ease, easing: Easing.out(Easing.cubic) }));
  };
  const release = () => {
    px.set(-1);
    py.set(-1);
    tiltX.set(withTiming(0, { duration: 450, easing: Easing.inOut(Easing.cubic) }));
    tiltY.set(withTiming(0, { duration: 450, easing: Easing.inOut(Easing.cubic) }));
  };

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateX: `${tiltX.value}deg` }, { rotateY: `${tiltY.value}deg` }],
  }));

  const { doneCount, todayNumber, daysLeft, isOver } = progress;
  const todayDay = progress.days.find((d) => d.date === todayStr);
  const faceRecord = habit ? recordsMap.get(`${habit.id}_${todayStr}`) : undefined;

  let status: string;
  if (isOver) {
    status = progress.earnedBadge
      ? `Finished ${shortDate(progress.endDate)} · badge earned`
      : `Finished at ${Math.round(progress.strength * 100)}%. A badge needs 50%.`;
  } else if (todayDay?.state === 'done') status = 'Today is recorded';
  else if (todayDay?.state === 'vacation') status = 'Today is a vacation day';
  else status = 'Today is open';

  return (
    <Animated.View
      style={[styles.card, cardStyle]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onTouchStart={(e) => track(e, 160)}
      onTouchMove={(e) => track(e, 90)}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      <LinearGradient
        colors={['#1D1840', '#121228', '#0F2233']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <HoloFoil variant="card" pointerX={px} pointerY={py} />
      <View style={styles.cardFrame} pointerEvents="none">
        <View style={styles.cardTop}>
          <Text style={styles.cardDay}>
            {isOver ? 'QUEST COMPLETE' : `DAY ${todayNumber} OF ${QUEST_LENGTH}`}
          </Text>
          {!isOver && (
            <Text style={styles.cardLeft}>{daysLeft === 0 ? 'Last day' : `${daysLeft} to go`}</Text>
          )}
        </View>

        <View style={styles.cardMiddle}>
          <View style={[styles.face, { borderColor: quest.habitColor }]}>
            {habit ? (
              <TileContent habit={habit} record={faceRecord} tileWidth={84} tileHeight={84} />
            ) : (
              <Text style={styles.faceGone}>?</Text>
            )}
          </View>
          <View style={styles.cardNameCol}>
            <Text style={styles.cardName} numberOfLines={2}>
              {habit?.name ?? quest.habitName}
            </Text>
            <Text style={styles.cardStatus}>{status}</Text>
          </View>
        </View>

        <View style={styles.countRow}>
          <Text style={styles.countBig}>{doneCount}</Text>
          <Text style={styles.countOf}>{` / ${QUEST_LENGTH} days recorded`}</Text>
        </View>

        <View style={styles.strengthRow}>
          <Text style={styles.strengthLabel}>HABIT STRENGTH</Text>
          <Text style={styles.strengthValue}>{`${Math.round(progress.strength * 100)}%`}</Text>
        </View>
        {/* The habit strength bar: fill = habit strength, tick = the 50% line. */}
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round(progress.strength * 100)}%` }]}>
            <LinearGradient colors={HOLO_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </View>
          <View style={[styles.barLine, { left: `${STRENGTH_LINE * 100}%` }]} />
        </View>
      </View>
    </Animated.View>
  );
}

function DayGrid({ days, color }: { days: QuestDay[]; color: string }) {
  const rows: QuestDay[][] = [];
  for (let i = 0; i < days.length; i += COLS) rows.push(days.slice(i, i + COLS));
  return (
    <View style={styles.grid} accessibilityLabel="60 day grid">
      {rows.map((row, ri) => (
        <View key={ri} style={styles.gridRow}>
          {row.map((d) => (
            <DayCell key={d.date} day={d} color={color} />
          ))}
          {/* Skipped days make the grid longer than 60; keep a short last row's cells square. */}
          {Array.from({ length: COLS - row.length }, (_, i) => (
            <View key={`pad-${i}`} style={styles.cellPad} />
          ))}
        </View>
      ))}
    </View>
  );
}

function DayCell({ day, color }: { day: QuestDay; color: string }) {
  if (day.state === 'done') {
    return (
      <View style={[styles.cell, { backgroundColor: color, borderColor: color }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)', 'rgba(127,233,255,0.3)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }
  if (day.state === 'open') return <OpenCell dayNumber={day.dayNumber ?? 0} />;
  if (day.state === 'vacation') {
    return (
      <View style={[styles.cell, styles.cellVacation]}>
        <Text style={styles.cellV}>V</Text>
      </View>
    );
  }
  if (day.state === 'winOnly') return <View style={[styles.cell, styles.cellWinOnly]} />;
  if (day.state === 'missed') return <View style={[styles.cell, styles.cellMissed]} />;
  return <View style={[styles.cell, styles.cellFuture]} />;
}

/** Today, not yet recorded: a slow eased glow so the open day reads as live. */
function OpenCell({ dayNumber }: { dayNumber: number }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(glow);
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + glow.value * 0.55 }));
  return (
    <Animated.View style={[styles.cell, styles.cellOpen, style]}>
      <Text style={styles.cellNum}>{dayNumber}</Text>
    </Animated.View>
  );
}

function LegendSwatch({
  kind,
  label,
  color,
}: {
  kind: 'done' | 'missed' | 'vacation' | 'winOnly';
  label: string;
  color?: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendBox,
          kind === 'done' && { backgroundColor: color, borderColor: color },
          kind === 'missed' && styles.cellMissed,
          kind === 'vacation' && styles.cellVacation,
          kind === 'winOnly' && styles.cellWinOnly,
        ]}
      />
      <ThemedText style={styles.legendText}>{label}</ThemedText>
    </View>
  );
}

/** A badged habit today: how it's holding up, and its habit strength. */
function PastStrength({ badge }: { badge?: HabitBadge }) {
  if (!badge?.status) return null;
  const mark = STATUS_LABELS[badge.status];
  return (
    <ThemedText style={[styles.pastStrength, { color: mark.ink }]}>
      {`${mark.label} · ${Math.round(badge.strength * 100)}%`}
    </ThemedText>
  );
}

/**
 * Every habit you've earned a badge on: the medal (×N when more than one),
 * when the latest was earned, and how it's holding up today.
 */
function YourBadges() {
  const numbered = useEarnedBadges();
  const { habits } = useHabits();
  const badges = useHabitBadges();
  if (numbered.length === 0) return null;
  // Newest first. Each badge is its own design; the status is its habit's.
  const rows = [...numbered].reverse();
  return (
    <View style={styles.past}>
      <ThemedText style={styles.pastLabel}>YOUR BADGES</ThemedText>
      {rows.map(({ quest, design }) => {
        const habit = habits.find((h) => h.id === quest.habitId);
        const badge = badges.get(quest.habitId);
        return (
          <View key={quest.id} style={styles.pastRow}>
            <BadgePatch design={design} size={40} bg={QuestColors.surface} tint={0.85} />
            <View style={styles.pastText}>
              <ThemedText style={styles.pastName} numberOfLines={1}>
                {habit?.name ?? quest.habitName}
              </ThemedText>
              {quest.finishedAt != null && (
                <ThemedText style={styles.pastDates} numberOfLines={1}>
                  {`Earned ${shortDate(formatDate(new Date(quest.finishedAt)))}`}
                </ThemedText>
              )}
            </View>
            {habit && badge && (
              <View style={styles.pastRight}>
                {badge.status && <StatusMark status={badge.status} size={16} />}
                <PastStrength badge={badge} />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  titleRow: {
    gap: 6,
  },
  titleBar: {
    height: 3,
    width: 44,
    borderRadius: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
    color: QuestColors.text,
  },
  lede: {
    fontSize: 15,
    lineHeight: 22,
    color: QuestColors.text,
  },
  rules: {
    gap: 8,
  },
  ruleRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  ruleMark: {
    color: HOLO_INK,
    fontSize: 12,
    lineHeight: 19,
  },
  ruleText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: QuestColors.text,
  },
  term: {
    fontWeight: '800',
    color: HOLO_INK,
  },
  readMoreOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    alignItems: 'center',
  },
  showLessRow: {
    alignItems: 'center',
    marginTop: 10,
  },
  readMorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(127,233,255,0.45)',
    backgroundColor: 'rgba(13,13,26,0.9)',
  },
  readMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: HOLO_INK,
  },
  chevronUp: {
    transform: [{ rotate: '180deg' }],
  },
  research: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    color: QuestColors.textDim,
    fontStyle: 'italic',
  },
  startCard: {
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(127,233,255,0.35)',
    backgroundColor: QuestColors.surface,
    padding: 14,
    gap: 12,
  },
  pickLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: HOLO_INK,
  },
  emptyText: {
    fontSize: 13,
    color: QuestColors.textDim,
  },
  pickList: {
    gap: 6,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(13,13,26,0.6)',
  },
  pickRowReady: {
    overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.55)',
  },
  readyTag: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#FFFFFF',
  },
  readyHint: {
    color: HOLO_INK,
    fontWeight: '700',
  },
  pickDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pickName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: QuestColors.text,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: QuestColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioFill: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: HOLO_INK,
  },
  beginButton: {
    overflow: 'hidden',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  beginDisabled: {
    borderColor: QuestColors.border,
    backgroundColor: 'rgba(13,13,26,0.6)',
  },
  beginText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: '#0D0D1A',
    textAlign: 'center',
  },
  beginHint: {
    fontSize: 12,
    color: QuestColors.textDim,
    textAlign: 'center',
  },
  activeWrap: {
    gap: 10,
  },
  card: {
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
    minHeight: 230,
  },
  cardFrame: {
    margin: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    padding: 14,
    gap: 14,
    backgroundColor: 'rgba(10,10,24,0.35)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDay: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#FFFFFF',
  },
  cardLeft: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  cardMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  face: {
    width: 88,
    height: 88,
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: Colors.dark.tileBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceGone: {
    fontSize: 36,
    fontWeight: '800',
    color: QuestColors.textDim,
  },
  cardNameCol: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cardStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  countBig: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    lineHeight: 48,
  },
  countOf: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
  },
  bar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  barLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 5,
    overflow: 'hidden',
  },
  restartText: {
    fontSize: 12,
    color: QuestColors.flameHigh,
  },
  strengthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: -6,
  },
  strengthLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.7)',
  },
  strengthValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  goneText: {
    fontSize: 12,
    color: QuestColors.flameHigh,
  },
  grid: {
    gap: 5,
    marginTop: 4,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 5,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPad: {
    flex: 1,
  },
  cellMissed: {
    backgroundColor: 'rgba(231,76,60,0.12)',
    borderColor: 'rgba(231,76,60,0.45)',
  },
  cellFuture: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: QuestColors.border,
  },
  cellOpen: {
    borderColor: HOLO_INK,
    borderWidth: 2,
    backgroundColor: 'rgba(127,233,255,0.12)',
  },
  cellNum: {
    fontSize: 10,
    fontWeight: '800',
    color: HOLO_INK,
  },
  // Win-only miss: excused, not a miss. Quiet gold, no letter.
  cellWinOnly: {
    backgroundColor: 'rgba(201,162,39,0.12)',
    borderColor: 'rgba(201,162,39,0.45)',
    borderStyle: 'dashed',
  },
  cellVacation: {
    backgroundColor: 'rgba(46,204,113,0.14)',
    borderColor: 'rgba(46,204,113,0.5)',
  },
  cellV: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2ECC71',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 14,
    rowGap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendBox: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 11,
    color: QuestColors.textDim,
  },
  dates: {
    fontSize: 12,
    color: QuestColors.textDim,
  },
  whyCard: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  whyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  whyLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  whyChevron: {
    fontSize: 13,
    color: QuestColors.textDim,
  },
  abandon: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
  abandonText: {
    fontSize: 12,
    color: QuestColors.textDim,
    textDecorationLine: 'underline',
  },
  past: {
    marginTop: 6,
    gap: 6,
  },
  pastLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: QuestColors.textDim,
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pastText: {
    flex: 1,
  },
  pastName: {
    fontSize: 14,
    fontWeight: '600',
    color: QuestColors.text,
  },
  pastDates: {
    fontSize: 11,
    color: QuestColors.textDim,
  },
  pastRight: {
    alignItems: 'flex-end',
  },
  pastStrength: {
    fontSize: 11,
    fontWeight: '700',
    color: QuestColors.textDim,
  },
  pastCount: {
    fontSize: 15,
    fontWeight: '800',
    color: QuestColors.text,
    fontVariant: ['tabular-nums'],
  },
});
