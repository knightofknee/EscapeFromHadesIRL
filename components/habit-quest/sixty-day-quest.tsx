import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import MaskedView from '@react-native-masked-view/masked-view';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { TileContent } from '@/components/habits/tile-content';
import { DEEP_COLORS, HoloFoil, HOLO_COLORS, type FoilPalette } from './holo-foil';
import { BadgePatch, IDEAL_INK, IDEAL_PURPLE, LEVEL_TWO_BLUE, LEVEL_TWO_INK, STATUS_LABELS, StatusMark, badgeStatus } from './badge-patch';
import { BadgeEarnedModal, type EarnedBadge } from './badge-earned-modal';
import { Colors, QuestColors } from '@/constants/theme';
import { useHabitQuest } from '@/contexts/habit-quest-context';
import { useHabits } from '@/hooks/use-habits';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyDates } from '@/hooks/use-win-only-dates';
import { useTodayDate } from '@/hooks/use-today-date';
import { useTodayRecords } from '@/hooks/use-today-records';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';
import { useHabitQuestProgress } from '@/hooks/use-habit-quest-progress';
import { useEarnedBadges, useHabitBadges, type HabitBadge } from '@/hooks/use-habit-badges';
import { designForNumber } from '@/lib/badge-designs';
import { useRecordsContext } from '@/contexts/records-context';
import {
  QUEST_LENGTH,
  creditedQuest,
  questEndDate,
  quickRecordValues,
  type QuestDay,
  type QuestLevel,
  type QuestProgress,
} from '@/lib/habit-quest';
import { isRecordCompleted, isRecordGoal, isTieredHabit, recordLevel } from '@/lib/habit-scoring';
import { computeStreak } from '@/lib/habit-streaks';
import { addDays, formatDate, parseDate } from '@/lib/date-utils';
import { MAINTENANCE_WINDOW_DAYS, STRENGTH_LINE } from '@/lib/habit-strength';
import { DECAY_DAYS, FORMATION_DAYS, strengthOver, type MaintenanceStatus } from '@/lib/habit-strength';
import type { QuestBurst } from './quest-celebration';
import { QuestDayPopover } from './quest-day-popover';
import type { PopoverAnchor } from '@/components/habits/day-breakdown-popover';
import type { Habit, HabitRecord } from '@/types/habit';
import type { HabitQuest } from '@/types/habit-quest';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(date: string): string {
  const d = parseDate(date);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const HOLO_INK = '#7FE9FF';
const COLS = 10;

/** As a quest-tuple for LinearGradient's colors prop. */
type ColorList = readonly [string, string, ...string[]];

/**
 * What differs between the 60-day quest (level 1) and Level Two (level 2):
 * the foil, its ink, the card's backing, and the words. Everything else is
 * one set of components reading this from context.
 */
type QuestKind = {
  level: QuestLevel;
  palette: FoilPalette;
  colors: ColorList;
  ink: string;
  /** The holo card's backing gradient. */
  backing: ColorList;
};
const KINDS: Record<QuestLevel, QuestKind> = {
  1: { level: 1, palette: 'rainbow', colors: HOLO_COLORS, ink: HOLO_INK, backing: ['#1D1840', '#121228', '#0F2233'] },
  2: { level: 2, palette: 'deep', colors: DEEP_COLORS, ink: LEVEL_TWO_INK, backing: ['#101640', '#0C1230', '#0A1E36'] },
};
const KindContext = createContext<QuestKind>(KINDS[1]);
/** The color a quest's days and check fill with: the habit's own on the 60-day quest, Level Two's blue there. */
const dayColor = (level: QuestLevel, habitColor: string) => (level === 2 ? LEVEL_TWO_BLUE : habitColor);
const useKind = () => useContext(KindContext);
/** inkAlpha for a habit color that may not be #RRGGBB (falls back to a faint white). */
const inkAlphaSafe = (color: string, a: number) =>
  /^#[0-9a-f]{6}$/i.test(color) ? inkAlpha(color, a) : `rgba(255,255,255,${a})`;
/** A #RRGGBB ink at an alpha (0..1). */
const inkAlpha = (ink: string, a: number) =>
  `${ink}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
/** How much further back the records window grows while the current streak runs off its edge. */
const STREAK_STEP_DAYS = 90;
/** Eased only, never a spring. */
const SMOOTH = Easing.inOut(Easing.cubic);


/**
 * THE 60-DAY QUEST: the top of the Quests tab. One habit at a time, 60 days
 * at a time; every recorded day counts at any level and a miss resets
 * nothing. Its own feature on its own collection, unrelated to the scored
 * challenges and run score below it.
 */
/** Where the Read more pill lands after Show less, when it has to scroll back: just under the top, list in view. */
const REVEAL_OFFSET = 44;

type RevealInScroll = (target: View | null, offset: number) => void;

type NewBadge = Omit<EarnedBadge, 'key' | 'design' | 'level'>;
type OnEarned = (badge: NewBadge, habitId: string) => void;

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
  colors = HOLO_COLORS,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  colors?: ColorList;
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
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      )}
      <Text style={[styles.beginText, disabled && { color: QuestColors.textDim }]}>{label}</Text>
    </Pressable>
  );
}

export function SixtyDayQuest({
  revealInScroll,
  stickyBegin,
  onCelebrate,
}: {
  revealInScroll?: RevealInScroll;
  stickyBegin?: StickyBeginApi;
  /** Today recorded from the card's check: the screen plays the day's celebration (same burst as the Habits grid). */
  onCelebrate?: (burst: QuestBurst) => void;
}) {
  const { activeQuest } = useHabitQuest();
  const { habit, progress } = useHabitQuestProgress();
  const [earned, setEarned] = useState<EarnedBadge | null>(null);
  const numbered = useEarnedBadges();
  // The badge just earned is the next one in the preselected sequence.
  const onEarned: OnEarned = (badge) =>
    setEarned({ ...badge, key: Date.now(), design: designForNumber(numbered.length + 1) });

  return (
    <KindContext.Provider value={KINDS[1]}>
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
        <ActiveQuest quest={activeQuest} habit={habit} progress={progress} onEarned={onEarned} onCelebrate={onCelebrate} />
      ) : (
        <StartQuest revealInScroll={revealInScroll} stickyBegin={stickyBegin} onEarned={onEarned} />
      )}

      <YourBadges />
      <BadgeEarnedModal earned={earned} onClose={() => setEarned(null)} />
    </View>
    </KindContext.Provider>
  );
}

/**
 * LEVEL TWO: under the 60-day quest. The same quest on a habit that already
 * has a badge, counting only goal-or-better days; finishing it at 50%
 * upgrades that badge. Runs alongside the 60-day quest. Grayed out until the
 * first badge is earned.
 */
export function LevelTwoQuest({
  revealInScroll,
  onCelebrate,
}: {
  revealInScroll?: RevealInScroll;
  onCelebrate?: (burst: QuestBurst) => void;
}) {
  const { activeLevelTwo } = useHabitQuest();
  const { habit, progress } = useHabitQuestProgress(2);
  const numbered = useEarnedBadges();
  const badges = useHabitBadges();
  const [earned, setEarned] = useState<EarnedBadge | null>(null);
  // The upgrade is the habit's own latest badge, now in its level two form.
  const onEarned: OnEarned = (badge, habitId) =>
    setEarned({
      ...badge,
      key: Date.now(),
      level: 2,
      design: badges.get(habitId)?.design ?? designForNumber(Math.max(1, numbered.length)),
    });
  const locked = numbered.length === 0 && !activeLevelTwo;

  return (
    <KindContext.Provider value={KINDS[2]}>
      <View style={styles.section}>
        <View style={styles.titleRow}>
          <LinearGradient
            colors={DEEP_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.titleBar, locked && styles.lockedBar]}
          />
          <ThemedText style={[styles.title, locked && styles.lockedTitle]}>LEVEL TWO</ThemedText>
        </View>
        <ThemedText style={[styles.lede, locked && styles.lockedText]}>
          Take a habit you&apos;ve earned a badge on to its goal level. 60 days, and only goal days
          count. Finish at 50% and the badge upgrades.
        </ThemedText>

        {locked ? (
          <View style={[styles.startCard, styles.lockedCard]} accessibilityState={{ disabled: true }}>
            <ThemedText style={styles.lockedNote}>Earn a badge on the 60-day quest to unlock Level Two.</ThemedText>
          </View>
        ) : activeLevelTwo && progress ? (
          <ActiveQuest quest={activeLevelTwo} habit={habit} progress={progress} onEarned={onEarned} onCelebrate={onCelebrate} />
        ) : (
          <StartQuest revealInScroll={revealInScroll} onEarned={onEarned} />
        )}
        <BadgeEarnedModal earned={earned} onClose={() => setEarned(null)} />
      </View>
    </KindContext.Provider>
  );
}

/** Rule text line height: the first line of the habit-strength rule shows in full while collapsed. */
const RULE_LINE = 19;
/** Faded strip below that line, where the Read more pill sits over the text. */
const RULES_FADE = 40;

/**
 * The rules, collapsed by default so they don't bury the habit list: the
 * science, the first rule and the first line of the habit-strength rule show
 * in full, the text below fades out, and a centered Read more pill sits over
 * the fade.
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
  const { ink } = useKind();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.readMorePill, { borderColor: inkAlpha(ink, 0.45) }, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Show less of the rules' : 'Read more of the rules'}
    >
      <Text style={[styles.readMoreText, { color: ink }]}>{open ? 'Show less' : 'Read more'}</Text>
      <Svg width={10} height={10} viewBox="0 0 10 10" style={open ? styles.chevronUp : undefined}>
        <Path d="M2 3.5 L5 6.5 L8 3.5" stroke={ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </Pressable>
  );
}

/** The study basis for the 60 days and the 50% / 20% lines (Level Two: for stepping a habit up). */
function Research() {
  const { ink, level } = useKind();
  if (level === 2) {
    // Checked against the papers' own text: Lally et al. 2010 p.1005-1006
    // (exercise group 1.5x longer to asymptote, not significant, study not
    // powered for subgroups); Verplanken 2006 as cited there (complex
    // behaviours reach lower automaticity, with limited repetitions);
    // Kaushal & Rhodes 2015 (n = 111 new gym members; low behavioural
    // complexity, measured as effort and difficulty, predicted habit growth).
    return (
      <View style={[styles.researchBox, styles.researchStack, { borderLeftColor: ink }]}>
        {/* The findings, then what Level Two does with them. */}
        <ThemedText style={styles.research}>
          Harder versions of a habit take longer to stick. In Lally et al. (2010), people building
          an exercise habit took one and a half times as long to reach full automaticity as people
          building an eating or drinking habit, in a group too small to be certain. Complex
          behaviours settle at lower automaticity after the same number of repetitions (Verplanken,
          2006), and among 111 new gym members, the harder the exercise felt, the more slowly the
          habit formed (Kaushal and Rhodes, 2015).
        </ThemedText>
        <ThemedText style={styles.research}>
          So Level Two gives the harder version its own {QUEST_LENGTH} days, counted only on goal
          days, on a habit that already runs at basic.
        </ThemedText>
      </View>
    );
  }
  return (
    <View style={[styles.researchBox, { borderLeftColor: ink }]}>
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

function Rules({ onPeekY, withResearch = true }: { onPeekY?: (y: number) => void; withResearch?: boolean }) {
  const { level } = useKind();
  if (level === 2) return <LevelTwoRules onPeekY={onPeekY} withResearch={withResearch} />;
  return (
    <View style={styles.rules}>
      {/* Science first: why the quest is built this way, then how it runs. */}
      {withResearch && <Research />}
      <Rule>Every day you record the habit counts, at any level. Basic, goal, or ideal.</Rule>
      <Rule onLayout={onPeekY ? (e) => onPeekY(e.nativeEvent.layout.y) : undefined}>
        <Term>Habit strength</Term> scores how automatic the habit is getting, from 0 to 100%,
        counting your history from before the quest. Each day you show up builds it. Each day you
        skip, it fades, a bit faster than it builds. It&apos;s averaged over the last 7 days, so a
        day off doesn&apos;t swing it.
      </Rule>
      <Rule>
        <Term>50%</Term> habit strength is the line that matters. Doing the habit about 5 days a
        week holds it.
      </Rule>
      <Rule>
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
    </View>
  );
}

function LevelTwoRules({ onPeekY, withResearch }: { onPeekY?: (y: number) => void; withResearch: boolean }) {
  return (
    <View style={styles.rules}>
      {withResearch && <Research />}
      <Rule>
        Only days you reach <Term>goal</Term> or ideal count. A basic day shows on the calendar but
        counts as a day off.
      </Rule>
      <Rule onLayout={onPeekY ? (e) => onPeekY(e.nativeEvent.layout.y) : undefined}>
        <Term>Habit strength</Term> here counts goal days alone. It builds and fades the same way
        as on the 60-day quest.
      </Rule>
      <Rule>
        The quest restarts at day 1 after a full week with no goal day, after a full week under
        50% once you&apos;ve reached it, or as soon as 50% by day 60 is out of reach.
      </Rule>
      <Rule>
        Vacation and win-only days you skip don&apos;t use up any of the 60. Day 60 moves out to
        make up for them.
      </Rule>
      <Rule>
        It runs alongside the 60-day quest. Reach day 60 at 50% or more and the habit&apos;s badge
        upgrades.
      </Rule>
      <Rule>
        Already hitting goal? Day 1 goes back as far as the quest would have run without
        restarting, up to 60 days.
      </Rule>
      <Rule>
        An upgraded badge glows <Text style={{ color: LEVEL_TWO_INK, fontWeight: '800' }}>blue</Text>{' '}
        while it&apos;s strong at goal (50% or more), gold while it&apos;s kept up, and red in
        remission.
      </Rule>
    </View>
  );
}

/**
 * A tap-to-open card on the active quest: label + chevron, body when open.
 * Only the header row toggles it; the body sits outside the pressable, so a
 * scroll that starts on the text doesn't close the card (and iOS lays the
 * italic text out at its real width there instead of clipping its last word).
 */
function InfoCard({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.whyCard}>
      <Pressable
        style={styles.whyHeader}
        onPress={() => setOpen((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
      >
        <ThemedText style={styles.whyLabel}>{label}</ThemedText>
        <ThemedText style={styles.whyChevron}>{open ? '▾' : '▸'}</ThemedText>
      </Pressable>
      {open && <View style={styles.whyBody}>{children}</View>}
    </View>
  );
}

function Rule({ children, onLayout }: { children: ReactNode; onLayout?: (e: LayoutChangeEvent) => void }) {
  const { ink } = useKind();
  return (
    <View style={styles.ruleRow} onLayout={onLayout}>
      <Text style={[styles.ruleMark, { color: ink }]}>✦</Text>
      <ThemedText style={styles.ruleText}>{children}</ThemedText>
    </View>
  );
}

/** A named measure (like habit strength), set apart so it reads as a term. */
function Term({ children }: { children: ReactNode }) {
  const { ink } = useKind();
  return <Text style={[styles.term, { color: ink }]}>{children}</Text>;
}

// ---------- Not started: the pitch + habit picker ----------

function StartQuest({
  revealInScroll,
  stickyBegin,
  onEarned,
}: {
  revealInScroll?: RevealInScroll;
  stickyBegin?: StickyBeginApi;
  onEarned: OnEarned;
}) {
  const kind = useKind();
  const { level } = kind;
  const { habits } = useHabits();
  const { startQuest, pastQuests: levelOnePast, pastLevelTwo } = useHabitQuest();
  const pastQuests = level === 2 ? pastLevelTwo : levelOnePast;
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

  // Day 60 of each habit's latest badge (or upgrade): those days can't earn another.
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
          level,
        }),
      );
    }
    return out;
  }, [habits, windowLoaded, todayStr, recordsMap, dateSet, winOnly, lastBadgeEnd, level]);
  // 60-day quest: a habit with a badge moves to Your badges, out of this
  // list, unless it has slid into remission: then another quest is how it
  // gets rebuilt. Level Two: only badged habits that can reach goal, until
  // upgraded (again, unless the upgrade slid into remission at goal).
  const badges = useHabitBadges();
  const pickable = habits.filter((h) => {
    const b = badges.get(h.id);
    if (level === 2) {
      if (!b || !isTieredHabit(h)) return false;
      return !b.levelTwo || b.levelTwo.status === 'remission';
    }
    return !b || b.status === 'remission';
  });
  const badgedTiered = level === 2 && habits.some((h) => badges.has(h.id) && isTieredHabit(h));
  const credit = selected ? (credits.get(selected.id) ?? null) : null;
  const badgeReady = !!credit?.progress.earnedBadge;

  function begin() {
    if (!selected || !credit) return;
    const { progress } = credit;
    if (progress.earnedBadge) {
      startQuest(
        selected,
        todayStr,
        {
          attemptStart: progress.attemptStart,
          endDate: progress.endDate,
          daysDone: progress.doneCount,
          strength: progress.strength,
        },
        level,
      );
      onEarned({ habitName: selected.name, daysDone: progress.doneCount, strength: progress.strength }, selected.id);
      setSelectedId(null);
    } else {
      startQuest(selected, credit.startDate, undefined, level);
    }
  }

  const name = selected?.name.toUpperCase() ?? '';
  const beginLabel =
    level === 2
      ? !selected
        ? 'BEGIN LEVEL TWO'
        : badgeReady
          ? `UPGRADE YOUR ${name} BADGE`
          : `BEGIN LEVEL TWO: ${name}`
      : !selected
        ? 'BEGIN 60 DAYS'
        : badgeReady
          ? `TAKE YOUR ${name} BADGE`
          : `BEGIN 60 DAYS OF ${name}`;

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
    beginHint =
      level === 2
        ? `${selected.name} shines because its last 60 days at goal already pass: its badge upgrades. Take it, then pick a habit for Level Two.`
        : `${selected.name} shines because its last 60 days already pass: you've earned a badge on it. Take it, then pick a habit for your quest.`;
  } else if (credit && credit.creditedDays > 0) {
    beginHint = `Your last ${credit.creditedDays} ${level === 2 ? 'goal ' : ''}day${credit.creditedDays === 1 ? '' : 's'} count, so you start on day ${
      credit.creditedDays + 1
    }. Day 60 is ${shortDate(credit.progress.endDate)}.`;
  } else if (selected) {
    beginHint = `Day 1 is today. Day 60 is ${shortDate(credit?.progress.endDate ?? questEndDate(todayStr))}.`;
  }

  return (
    <View style={[styles.startCard, { borderColor: inkAlpha(kind.ink, 0.35) }]}>
      <HoloFoil variant="tile" palette={kind.palette} />
      <CollapsibleRules revealInScroll={revealInScroll} />
      <ThemedText style={styles.pickLabel}>{level === 2 ? 'CHOOSE A BADGED HABIT' : 'CHOOSE ONE HABIT'}</ThemedText>
      {pickable.length === 0 ? (
        <ThemedText style={styles.emptyText}>
          {level === 2
            ? badgedTiered
              ? 'Every badge you can upgrade is upgraded.'
              : 'Level Two needs a badged habit with a goal level. Yes/no and counter habits have none.'
            : habits.length === 0
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
                  on && { borderColor: kind.ink, backgroundColor: inkAlpha(kind.ink, 0.08) },
                ]}
                onPress={() => setSelectedId(on ? null : h.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={ready ? `${h.name}, ${level === 2 ? 'upgrade' : 'badge'} ready` : h.name}
              >
                {ready && <HoloFoil variant="card" palette={kind.palette} />}
                <View style={[styles.pickDot, { backgroundColor: h.color }]} />
                <ThemedText style={styles.pickName} numberOfLines={1}>
                  {h.name}
                </ThemedText>
                {ready && <Text style={styles.readyTag}>{level === 2 ? 'UPGRADE READY' : 'BADGE READY'}</Text>}
                {!ready &&
                  (level === 2 ? badges.get(h.id)?.levelTwo?.status : badges.get(h.id)?.status) === 'remission' && (
                    <Text style={[styles.readyTag, { color: STATUS_LABELS.remission.ink }]}>IN REMISSION</Text>
                  )}
                <View style={[styles.radio, on && { borderColor: kind.ink }]}>
                  {on && <View style={[styles.radioFill, { backgroundColor: kind.ink }]} />}
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
          colors={kind.colors}
          accessibilityLabel={
            level === 2
              ? badgeReady && selected
                ? `Upgrade your ${selected.name} badge`
                : 'Begin Level Two'
              : badgeReady && selected
                ? `Take your ${selected.name} badge`
                : 'Begin 60 days'
          }
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
  onCelebrate,
}: {
  quest: HabitQuest;
  habit?: Habit;
  progress: QuestProgress;
  onEarned: OnEarned;
  onCelebrate?: (burst: QuestBurst) => void;
}) {
  const kind = useKind();
  const { level } = kind;
  const { abandonQuest, finishQuest } = useHabitQuest();
  const { recordsMap } = useRecordsContext();

  // Tap a day for its card. The cell is measured against this view so the
  // card sits right above it. Any touch here closes it (touches still reach
  // the cells, so tapping another day swaps to it; the same day toggles).
  const wrapRef = useRef<View>(null);
  const [wrapWidth, setWrapWidth] = useState(0);
  const [dayCard, setDayCard] = useState<{ day: QuestDay; anchor: PopoverAnchor } | null>(null);
  const closedByTouchRef = useRef<string | null>(null);
  const openDay = (day: QuestDay, cell: View) => {
    if (closedByTouchRef.current === day.date) {
      closedByTouchRef.current = null;
      return;
    }
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.measureInWindow((wx, wy) =>
      cell.measureInWindow((x, y, width, height) =>
        setDayCard({ day, anchor: { x: x - wx, y: y - wy, width, height } }),
      ),
    );
  };
  const card = dayCard ? describeDay(dayCard.day, habit, recordsMap.get(`${quest.habitId}_${dayCard.day.date}`), kind.ink) : null;
  // Level Two: ideal days stand out on the grid, so the next step is in view.
  const idealDates = useMemo(() => {
    const out = new Set<string>();
    if (level !== 2 || !habit) return out;
    for (const d of progress.days) {
      if (d.state === 'done' && recordLevel(habit, recordsMap.get(`${quest.habitId}_${d.date}`)) >= 3) out.add(d.date);
    }
    return out;
  }, [level, habit, progress.days, recordsMap, quest.habitId]);
  // What comes next: habit strength counted on ideal days alone, over the
  // same lookback the badges use. Today counts once it's ideal.
  const { todayStr } = useTodayDate();
  const { dateSet: vacationDates } = useVacationDays();
  const winOnlyDates = useWinOnlyDates();
  const idealStrength = useMemo(() => {
    if (level !== 2 || !habit) return null;
    const isIdeal = (date: string) => recordLevel(habit, recordsMap.get(`${quest.habitId}_${date}`)) >= 3;
    const through = isIdeal(todayStr) ? todayStr : addDays(todayStr, -1);
    return strengthOver(addDays(todayStr, -(MAINTENANCE_WINDOW_DAYS - 1)), through, (date) =>
      isIdeal(date) ? 'done' : vacationDates.has(date) || winOnlyDates.has(date) ? 'excused' : 'missed',
    ).strength;
  }, [level, habit, recordsMap, quest.habitId, todayStr, vacationDates, winOnlyDates]);

  const confirmAbandon = () =>
    Alert.alert(
      'Abandon this quest?',
      `Your ${level === 2 ? 'Level Two' : '60-day'} progress on ${quest.habitName} is cleared. Your habit records stay.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Abandon', style: 'destructive', onPress: () => abandonQuest(level) },
      ],
    );

  return (
    <View
      ref={wrapRef}
      style={styles.activeWrap}
      onLayout={(e) => setWrapWidth(e.nativeEvent.layout.width)}
      onTouchStart={() => {
        closedByTouchRef.current = dayCard?.day.date ?? null;
        if (dayCard) setDayCard(null);
      }}
    >
      <HoloCard quest={quest} habit={habit} progress={progress} onCelebrate={onCelebrate} />

      {!habit && !progress.isOver && (
        <ThemedText style={styles.goneText}>
          This habit was deleted or archived, so new days can&apos;t count. Abandon the quest to
          choose another.
        </ThemedText>
      )}

      <DayGrid days={progress.days} color={dayColor(level, quest.habitColor)} idealDates={idealDates} onDayPress={openDay} />
      <View style={styles.legend}>
        <LegendSwatch kind="done" label={level === 2 ? 'Goal' : 'Recorded'} color={dayColor(level, quest.habitColor)} />
        {level === 2 && <LegendSwatch kind="ideal" label="Ideal" color={dayColor(level, quest.habitColor)} />}
        {level === 2 && <LegendSwatch kind="basic" label="Basic" color={dayColor(level, quest.habitColor)} />}
        <LegendSwatch kind="missed" label="Missed" />
        <LegendSwatch kind="vacation" label="Vacation" />
        {progress.days.some((d) => d.state === 'winOnly') && <LegendSwatch kind="winOnly" label="Win-only" />}
      </View>
      {level === 2 && idealStrength != null && (
        <View style={styles.nextBox}>
          <ThemedText style={styles.nextLabel}>WHAT COMES NEXT</ThemedText>
          <View style={styles.nextRow}>
            <View style={styles.nextStat}>
              <Text style={styles.nextNumber}>
                <Text style={styles.nextStar}>★ </Text>
                {idealDates.size}
              </Text>
              <Text style={styles.nextStatLabel}>IDEAL DAYS</Text>
            </View>
            <View style={styles.nextStat}>
              <Text style={styles.nextNumber}>{`${Math.round(idealStrength * 100)}%`}</Text>
              <Text style={styles.nextStatLabel}>IDEAL HABIT STRENGTH</Text>
            </View>
          </View>
        </View>
      )}
      <ThemedText style={styles.dates}>
        {`Day 1 ${shortDate(progress.attemptStart)} · Day 60 ${shortDate(progress.endDate)}`}
      </ThemedText>
      {progress.restartedOn && (
        <ThemedText style={styles.restartText}>{restartNote(progress, level)}</ThemedText>
      )}

      {progress.isOver && (
        <Pressable
          style={styles.beginButton}
          onPress={() => {
            finishQuest(
              {
                attemptStart: progress.attemptStart,
                endDate: progress.endDate,
                daysDone: progress.doneCount,
                strength: progress.strength,
              },
              level,
            );
            if (progress.earnedBadge) {
              onEarned(
                {
                  habitName: habit?.name ?? quest.habitName,
                  daysDone: progress.doneCount,
                  strength: progress.strength,
                },
                quest.habitId,
              );
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Choose the next habit"
        >
          <LinearGradient colors={kind.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Text style={styles.beginText}>CHOOSE THE NEXT HABIT</Text>
        </Pressable>
      )}

      <InfoCard label={level === 2 ? 'WHY LEVEL TWO' : 'WHY 60 DAYS'}>
        <Research />
      </InfoCard>
      <InfoCard label="HOW IT WORKS">
        <Rules withResearch={false} />
      </InfoCard>

      {!progress.isOver && (
        <Pressable onPress={confirmAbandon} hitSlop={8} style={styles.abandon} accessibilityRole="button">
          <ThemedText style={styles.abandonText}>Abandon quest</ThemedText>
        </Pressable>
      )}
      {card && dayCard && (
        <QuestDayPopover
          anchor={dayCard.anchor}
          hostWidth={wrapWidth}
          title={card.title}
          status={card.status}
          statusColor={card.color}
          ink={kind.ink}
        />
      )}
    </View>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A quest day's card: the date and the outcome, nothing more. */
function describeDay(
  day: QuestDay,
  habit: Habit | undefined,
  record: HabitRecord | undefined,
  ink: string,
): { title: string; status: string; color: string } {
  const d = parseDate(day.date);
  const title = `${WEEKDAYS[d.getDay()]}, ${shortDate(day.date)}`;
  const tier = habit ? recordLevel(habit, record) : 0;
  const tierWord = habit && isTieredHabit(habit) ? ['', 'Basic', 'Goal', 'Ideal'][tier] : tier > 0 ? 'Done' : '';
  switch (day.state) {
    case 'done':
    case 'basic':
      return { title, status: tierWord, color: ink };
    case 'missed':
      return { title, status: 'Missed', color: STATUS_LABELS.remission.ink };
    case 'open':
      return { title, status: tierWord || 'Today', color: tierWord ? ink : QuestColors.text };
    case 'vacation':
      return { title, status: 'Vacation', color: '#2ECC71' };
    case 'winOnly':
      return { title, status: 'Win-only', color: STATUS_LABELS.kept.ink };
    default:
      return { title, status: 'Upcoming', color: QuestColors.textDim };
  }
}

/** Why the quest restarted, and what it kept: "Restarted Nov 23 after ... The 9 days you'd kept up still count." */
function restartNote(progress: QuestProgress, level: QuestLevel): string {
  const on = progress.restartedOn!;
  const why =
    progress.restartReason === 'weekUnder'
      ? 'a full week under 50%'
      : progress.restartReason === 'cantWin'
        ? 'day 60 could no longer reach 50%'
        : level === 2
          ? 'a full week with no goal day'
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
function HoloCard({
  quest,
  habit,
  progress,
  onCelebrate,
}: {
  quest: HabitQuest;
  habit?: Habit;
  progress: QuestProgress;
  onCelebrate?: (burst: QuestBurst) => void;
}) {
  const kind = useKind();
  const { level } = kind;
  // The reactive map, not getRecordForDay: that reads a ref, which a
  // compiler-memoized render would serve stale.
  const { recordsMap, loadedRange, ensureRange } = useRecordsContext();
  const { todayStr } = useTodayDate();
  const { recordHabit } = useTodayRecords();
  const { celebratedDateRef, celebratedLevelTwoDateRef } = useHabitQuest();
  // Notes the day the check celebrated, so the Habits grid doesn't replay it.
  const noteCelebrated = (date: string | null) => {
    if (level === 2) celebratedLevelTwoDateRef.current = date;
    else celebratedDateRef.current = date;
  };
  const { dateSet: vacationSet } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();
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

  // The habit's current streak (any level counts, as on Stats; goal or
  // better on Level Two), scanned
  // over the loaded window. A run still alive at the window's first day may
  // be longer than what's loaded, so the window grows back in steps until
  // the run closes or the habit's creation is reached.
  const windowStart = loadedRange?.start;
  const streak = useMemo(() => {
    if (!habit) return null;
    return computeStreak(habit, recordsMap, level === 2 ? isRecordGoal : isRecordCompleted, vacationSet, {
      now: parseDate(todayStr),
      winOnlyWeekends,
      scanUntil: windowStart,
    });
  }, [habit, recordsMap, vacationSet, winOnlyWeekends, windowStart, todayStr, level]);
  const streakOpen = streak != null && streak.current > 0 && streak.longestOpen && streak.current === streak.longest;
  const createdDate = habit ? formatDate(new Date(habit.createdAt)) : null;
  useEffect(() => {
    if (!streakOpen || !windowStart || !createdDate || windowStart <= createdDate) return;
    ensureRange(addDays(windowStart, -STREAK_STEP_DAYS), todayStr);
  }, [streakOpen, windowStart, createdDate, ensureRange, todayStr]);

  // Each visit to the screen replays the check's draw, and remembers whether
  // today was recorded from the check during this visit: only that record
  // can be taken back here. One recorded before you arrived is locked (the
  // tile is where records get changed).
  const [visit, setVisit] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setVisit((v) => v + 1);
    }, []),
  );
  const [tappedVisit, setTappedVisit] = useState<number | null>(null);
  const recorded = todayDay?.state === 'done';
  const vacation = todayDay?.state === 'vacation';
  // Level Two's check only shows today's status: reaching goal is recorded
  // on the habit's tile, where the real amount or level goes in, not
  // ticked here (user, 2026-11-12).
  const quick = habit && level === 1 ? quickRecordValues(habit.recordingMode) : null;
  const canTap = !isOver && quick != null && !vacation && (!recorded || tappedVisit === visit);
  const onCheck = (origin?: { x: number; y: number }) => {
    if (!habit || !quick || !canTap) return;
    if (recorded) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      recordHabit(habit.id, quick.cleared);
      setTappedVisit(null);
      noteCelebrated(null);
    } else {
      recordHabit(habit.id, quick.first);
      setTappedVisit(visit);
      // The day's celebration, bursting from the check (the Habits grid
      // plays the same one from the tile; it has its own haptic), and noted
      // so the grid does not replay it. Today is not in doneCount yet.
      if (onCelebrate) {
        noteCelebrated(todayStr);
        onCelebrate({
          key: Date.now(),
          doneCount: doneCount + 1,
          habitName: habit.name,
          origin,
          palette: kind.palette,
          // Today wasn't in the streak yet: it runs through yesterday.
          streak: streak != null ? streak.current + 1 : undefined,
        });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
  };

  const finished = isOver
    ? progress.earnedBadge
      ? `Finished ${shortDate(progress.endDate)} · ${level === 2 ? 'badge upgraded' : 'badge earned'}`
      : `Finished at ${Math.round(progress.strength * 100)}%. ${level === 2 ? 'An upgrade' : 'A badge'} needs 50%.`
    : null;

  return (
    <Animated.View
      style={[styles.card, cardStyle]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      onTouchStart={(e) => track(e, 160)}
      onTouchMove={(e) => track(e, 90)}
      onTouchEnd={release}
      onTouchCancel={release}
    >
      <LinearGradient colors={kind.backing} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <HoloFoil variant="card" palette={kind.palette} pointerX={px} pointerY={py} />
      <View style={styles.cardFrame} pointerEvents="box-none">
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
            {finished && <Text style={styles.cardStatus}>{finished}</Text>}
          </View>
          {/* The one action on the card, apart from the information: its
              own column on the right, level with the tile. */}
          {!isOver && (
            <QuestCheck
              checked={recorded}
              dim={vacation || (!recorded && quick == null)}
              enabled={canTap}
              color={dayColor(level, quest.habitColor)}
              visit={visit}
              onPress={onCheck}
            />
          )}
        </View>

        {/* The two numbers side by side as one close group centered on the
            card (no divider, a small gap: they are two readings of the same
            thing, not opposites): days recorded this attempt and the habit's
            current streak, each a centered cell, number over label. */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.countBig}>{doneCount}</Text>
            <Text style={styles.statLabel}>{level === 2 ? 'GOAL DAYS' : 'DAYS'}</Text>
          </View>
          {streak != null && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                {/* The flame hangs off a zero-width anchor right after the
                    number, so the number stays centered under its label. */}
                <View style={styles.streakNumber}>
                  <Text style={styles.countBig}>{streak.current}</Text>
                  <View style={styles.flameAnchor}>{streak.current >= FLAME_STREAK && <StreakFlame />}</View>
                </View>
                <Text style={styles.statLabel}>STREAK</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.strengthRow}>
          <Text style={styles.strengthLabel}>HABIT STRENGTH</Text>
          <Text style={styles.strengthValue}>{`${Math.round(progress.strength * 100)}%`}</Text>
        </View>
        {/* The habit strength bar: fill = habit strength, tick = the 50% line. */}
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round(progress.strength * 100)}%` }]}>
            <LinearGradient colors={kind.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </View>
          <View style={[styles.barLine, { left: `${STRENGTH_LINE * 100}%` }]} />
        </View>
      </View>
    </Animated.View>
  );
}

/** A streak earns its flame from day 3; 1 or 2 days is too early to call it one (user). */
const FLAME_STREAK = 3;

/** A small, quiet flame beside a live streak of FLAME_STREAK days or more. */
function StreakFlame() {
  return (
    <Svg width={14} height={18} viewBox="0 0 14 18" style={styles.streakFlame} accessibilityLabel="Streak active">
      <Path
        d="M7 1 C8 4.5 12.5 6.5 12.5 11.5 A5.5 5.5 0 0 1 1.5 11.5 C1.5 8.5 3.5 7 4.5 5.5 C4.8 7.5 5.8 8.5 6.6 8.8 C6.2 6 6.2 3.5 7 1 Z"
        fill={QuestColors.flameHigh}
        opacity={0.75}
      />
      <Path d="M7 10 C7.6 11.4 9.2 12 9.2 13.8 A2.2 2.2 0 0 1 4.8 13.8 C4.8 12.4 6.2 11.6 7 10 Z" fill="#FFD27A" opacity={0.7} />
    </Svg>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_PATH = 'M5 12.5 L10 17.5 L19 7.5';
/** The check path's length, for the stroke draw. */
const CHECK_LEN = 22;
const CHECK_SIZE = 64;

/**
 * Today's check on the holo card, "Today" under it. Recorded, the
 * box fills with the habit color and draws its check on each visit to the
 * screen (an eased stroke, drawn twice, then held). Not yet, it breathes
 * like the grid's open day, and a tap records the first level. A check
 * tapped here can be tapped off again the same visit; one that was already
 * there when you arrived does nothing on tap.
 */
function QuestCheck({
  checked,
  dim,
  enabled,
  color,
  visit,
  onPress,
}: {
  checked: boolean;
  /** Nothing to do today here: a vacation day, or a habit its tile records through a modal. */
  dim: boolean;
  enabled: boolean;
  color: string;
  visit: number;
  /** Tapped; `origin` is the box's center in window coordinates, for a burst anchored on it. */
  onPress: (origin?: { x: number; y: number }) => void;
}) {
  const boxRef = useRef<View>(null);
  const draw = useSharedValue(checked ? 1 : 0);
  const breathe = useSharedValue(0);
  const replayedVisit = useRef(-1);

  useEffect(() => {
    // A new visit replays the draw; a change within the visit (a tap) draws once.
    const replay = replayedVisit.current !== visit;
    replayedVisit.current = visit;
    if (!checked) {
      draw.set(withTiming(0, { duration: 220, easing: SMOOTH }));
      return;
    }
    const stroke = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    if (!replay) {
      draw.set(stroke);
      return;
    }
    draw.set(0);
    draw.set(
      withSequence(
        withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }),
        withDelay(650, withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) })),
        withDelay(180, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })),
      ),
    );
  }, [checked, visit, draw]);

  const breathing = !checked && enabled;
  useEffect(() => {
    if (!breathing) {
      breathe.set(withTiming(0, { duration: 300, easing: SMOOTH }));
      return;
    }
    breathe.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(breathe);
  }, [breathing, breathe]);

  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - draw.value) }));
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(draw.value, [0, 1], ['rgba(255,255,255,0.6)', color]),
    backgroundColor: interpolateColor(draw.value, [0, 1], ['rgba(255,255,255,0.08)', color]),
    shadowOpacity: draw.value * 0.9,
    opacity: dim ? 0.35 : 0.65 + 0.35 * Math.max(draw.value, breathe.value),
  }));

  return (
    <Pressable
      onPress={() => {
        const box = boxRef.current;
        if (!box) return onPress();
        box.measureInWindow((x, y, w, h) => onPress({ x: x + w / 2, y: y + h / 2 }));
      }}
      disabled={!enabled}
      hitSlop={8}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !enabled }}
      accessibilityLabel={checked ? 'Today recorded' : 'Record today'}
    >
      <Animated.View ref={boxRef} style={[styles.check, { shadowColor: color }, boxStyle]}>
        <Svg width={CHECK_SIZE - 16} height={CHECK_SIZE - 16} viewBox="0 0 24 24">
          <AnimatedPath
            d={CHECK_PATH}
            stroke="#FFFFFF"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`}
            animatedProps={pathProps}
          />
        </Svg>
      </Animated.View>
      <Text style={[styles.checkLabel, dim && styles.checkLabelDim]}>TODAY</Text>
    </Pressable>
  );
}

function DayGrid({
  days,
  color,
  idealDates,
  onDayPress,
}: {
  days: QuestDay[];
  color: string;
  /** Days recorded at ideal: marked with a star. */
  idealDates?: Set<string>;
  /** Tapped a day: the cell's view, to anchor its day card on. */
  onDayPress?: (day: QuestDay, cell: View) => void;
}) {
  const rows: QuestDay[][] = [];
  for (let i = 0; i < days.length; i += COLS) rows.push(days.slice(i, i + COLS));
  return (
    <View style={styles.grid} accessibilityLabel="60 day grid">
      {rows.map((row, ri) => (
        <View key={ri} style={styles.gridRow}>
          {row.map((d) => (
            <DaySlot key={d.date} day={d} color={color} ideal={!!idealDates?.has(d.date)} onPress={onDayPress} />
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

/** One day of the grid, tappable for its day card. */
function DaySlot({
  day,
  color,
  ideal,
  onPress,
}: {
  day: QuestDay;
  color: string;
  ideal: boolean;
  onPress?: (day: QuestDay, cell: View) => void;
}) {
  const ref = useRef<View>(null);
  return (
    <Pressable
      ref={ref}
      style={styles.cellSlot}
      onPress={() => ref.current && onPress?.(day, ref.current)}
      accessibilityRole="button"
      accessibilityLabel={`${shortDate(day.date)}, ${day.state}`}
    >
      <DayCell day={day} color={color} ideal={ideal} />
    </Pressable>
  );
}

function DayCell({ day, color, ideal }: { day: QuestDay; color: string; ideal?: boolean }) {
  if (day.state === 'done') {
    return (
      <View style={[styles.cell, ideal ? styles.cellIdeal : { backgroundColor: color, borderColor: color }]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)', 'rgba(127,233,255,0.3)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {ideal && <Text style={styles.cellStar}>★</Text>}
      </View>
    );
  }
  if (day.state === 'open') return <OpenCell dayNumber={day.dayNumber ?? 0} />;
  // Level Two: recorded, but below goal. Shown in the habit's color, hollow.
  if (day.state === 'basic') {
    return <View style={[styles.cell, styles.cellBasic, { borderColor: color, backgroundColor: inkAlphaSafe(color, 0.16) }]} />;
  }
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
  const { ink } = useKind();
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(glow);
  }, [glow]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + glow.value * 0.55 }));
  return (
    <Animated.View style={[styles.cell, styles.cellOpen, { borderColor: ink, backgroundColor: inkAlpha(ink, 0.12) }, style]}>
      <Text style={styles.cellNum}>{dayNumber}</Text>
    </Animated.View>
  );
}

function LegendSwatch({
  kind,
  label,
  color,
}: {
  kind: 'done' | 'ideal' | 'basic' | 'missed' | 'vacation' | 'winOnly';
  label: string;
  color?: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendBox,
          kind === 'ideal' && styles.cellIdeal,
          kind === 'done' && { backgroundColor: color, borderColor: color },
          kind === 'basic' && color != null && [styles.cellBasic, { borderColor: color, backgroundColor: inkAlphaSafe(color, 0.16) }],
          kind === 'missed' && styles.cellMissed,
          kind === 'vacation' && styles.cellVacation,
          kind === 'winOnly' && styles.cellWinOnly,
        ]}
      />
      <ThemedText style={styles.legendText}>{label}</ThemedText>
    </View>
  );
}

/**
 * One level in an opened badge: its name, when it was earned, how it's
 * holding up, and its habit strength. Level 2 shows blue for strong.
 */
function LevelLine({
  label,
  when,
  status,
  strength,
  blue,
  color,
}: {
  label: string;
  when: string | null;
  status: MaintenanceStatus | null;
  strength: number | null;
  blue?: boolean;
  /** The value's color when there's no status (Ideal: purple). */
  color?: string;
}) {
  const ink = status ? (blue && status === 'strong' ? LEVEL_TWO_INK : STATUS_LABELS[status].ink) : (color ?? QuestColors.text);
  return (
    <View style={styles.levelLine}>
      <View style={styles.levelLeft}>
        <ThemedText style={styles.levelLabel}>{label}</ThemedText>
        {when && <ThemedText style={styles.levelWhen}>{when}</ThemedText>}
      </View>
      {strength != null && (
        <ThemedText style={[styles.levelValue, { color: ink }]}>
          {status ? `${STATUS_LABELS[status].label} · ` : ''}
          {`${Math.round(strength * 100)}%`}
        </ThemedText>
      )}
    </View>
  );
}

/** A badged habit today: how it's holding up, and its habit strength. */
function PastStrength({ badge }: { badge?: HabitBadge }) {
  const shown = badge ? badgeStatus(badge) : null;
  if (!shown) return null;
  return (
    <ThemedText style={[styles.pastStrength, { color: shown.ink }]}>
      {`${shown.label} · ${Math.round(shown.strength * 100)}%`}
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
  const { pastLevelTwo } = useHabitQuest();
  // Tap a badge to see how its habit is holding up at each level.
  const [openId, setOpenId] = useState<string | null>(null);
  // When each habit's badge was upgraded (its latest Level Two at 50%+).
  const upgradedOn = useMemo(() => {
    const out = new Map<string, number>();
    for (const q of pastLevelTwo) {
      if (q.finalStrength != null && q.finalStrength < STRENGTH_LINE) continue;
      const at = q.finishedAt ?? q.createdAt;
      if (at > (out.get(q.habitId) ?? 0)) out.set(q.habitId, at);
    }
    return out;
  }, [pastLevelTwo]);
  if (numbered.length === 0) return null;
  // Newest first. Each badge is its own design; the status is its habit's.
  // An upgraded habit's latest badge is the one shown upgraded.
  const rows = [...numbered].reverse();
  const latestOf = new Set<string>();
  const latestIds = new Set<string>();
  for (const { quest } of rows) {
    if (latestOf.has(quest.habitId)) continue;
    latestOf.add(quest.habitId);
    latestIds.add(quest.id);
  }
  return (
    <View style={styles.past}>
      <ThemedText style={styles.pastLabel}>YOUR BADGES</ThemedText>
      {rows.map(({ quest, design }) => {
        const habit = habits.find((h) => h.id === quest.habitId);
        const badge = badges.get(quest.habitId);
        const upgraded = !!badge?.levelTwo && latestIds.has(quest.id);
        const shown = badge ? badgeStatus(badge) : null;
        const open = openId === quest.id;
        const upgradedAt = upgradedOn.get(quest.habitId);
        return (
          <Pressable
            key={quest.id}
            style={styles.pastCard}
            onPress={() => setOpenId(open ? null : quest.id)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityHint="Shows habit strength at each level"
          >
          <View style={styles.pastRow}>
            <BadgePatch design={design} size={40} bg={QuestColors.surface} tint={0.85} level={upgraded ? 2 : 1} />
            <View style={styles.pastText}>
              <ThemedText style={styles.pastName} numberOfLines={2}>
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
                {shown && <StatusMark status={shown.status} size={16} color={shown.ink} />}
                <PastStrength badge={badge} />
              </View>
            )}
          </View>
            {open && badge && (
              <View style={styles.levels}>
                <LevelLine
                  label="Level 1"
                  when={quest.finishedAt != null ? `Earned ${shortDate(formatDate(new Date(quest.finishedAt)))}` : null}
                  status={badge.status}
                  strength={badge.strength}
                />
                {habit && isTieredHabit(habit) && (
                  <LevelLine
                    label="Level 2"
                    when={upgradedAt != null ? `Earned ${shortDate(formatDate(new Date(upgradedAt)))}` : 'Not yet'}
                    status={badge.levelTwo?.status ?? null}
                    strength={badge.levelTwo?.strength ?? null}
                    blue
                  />
                )}
                {badge.ideal != null && (
                  <LevelLine label="Ideal" when="Next" status={null} strength={badge.ideal} color={IDEAL_INK} />
                )}
              </View>
            )}
          </Pressable>
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
  // The science leads: full-size, full-strength text, italic, set off by a
  // holo rule on the left so it reads as the headline fact.
  researchBox: {
    borderLeftWidth: 2,
    borderLeftColor: HOLO_INK,
    paddingLeft: 10,
  },
  researchStack: {
    gap: 8,
  },
  // No fixed lineHeight: with one set, iOS sizes the box to exactly N
  // lines and then drops the last one to rounding (a 10-line paragraph lost
  // its last line, "...the habit fo"). The font's own spacing at 15pt reads
  // well and always draws every line. `undefined` also clears ThemedText's
  // default lineHeight.
  research: {
    fontSize: 15,
    lineHeight: undefined,
    color: QuestColors.text,
    fontStyle: 'italic',
  },
  // Level Two before the first badge: grayed out, nothing to pick.
  lockedBar: {
    opacity: 0.35,
  },
  lockedTitle: {
    color: QuestColors.textDim,
  },
  lockedText: {
    color: QuestColors.textDim,
  },
  lockedCard: {
    borderColor: QuestColors.border,
    opacity: 0.6,
  },
  lockedNote: {
    fontSize: 14,
    lineHeight: 20,
    color: QuestColors.textDim,
    textAlign: 'center',
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
    justifyContent: 'center',
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stat: {
    width: 80,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.7)',
    marginTop: -2,
  },
  checkRow: {
    alignItems: 'center',
    gap: 6,
  },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    elevation: 6,
  },
  checkLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
  checkLabelDim: {
    opacity: 0.45,
  },
  streakNumber: {
    flexDirection: 'row',
  },
  flameAnchor: {
    width: 0,
  },
  streakFlame: {
    position: 'absolute',
    left: 4,
    top: 15,
  },
  countBig: {
    fontSize: 44,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    lineHeight: 48,
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
    width: '100%',
    aspectRatio: 1,
    borderRadius: 5,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The tappable slot holds the row's flex share; the cell inside fills its
  // width and stays square.
  cellSlot: {
    flex: 1,
  },
  cellPad: {
    flex: 1,
  },
  cellMissed: {
    backgroundColor: 'rgba(231,76,60,0.12)',
    borderColor: 'rgba(231,76,60,0.45)',
  },
  // Ideal days: purple, starred.
  cellIdeal: {
    backgroundColor: IDEAL_PURPLE,
    borderColor: IDEAL_PURPLE,
  },
  cellStar: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  cellBasic: {
    borderWidth: 1.5,
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
  nextBox: {
    gap: 6,
  },
  nextLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: QuestColors.textDim,
  },
  nextRow: {
    flexDirection: 'row',
    gap: 28,
  },
  nextStat: {
    gap: 2,
  },
  nextNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: QuestColors.text,
    fontVariant: ['tabular-nums'],
  },
  nextStar: {
    color: IDEAL_INK,
  },
  nextStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
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
  },
  whyBody: {
    marginTop: 10,
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
  pastCard: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  levels: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: QuestColors.border,
    gap: 8,
  },
  levelLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  levelLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  levelLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: QuestColors.text,
  },
  levelWhen: {
    fontSize: 12,
    color: QuestColors.textDim,
  },
  levelValue: {
    fontSize: 13,
    fontWeight: '700',
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
