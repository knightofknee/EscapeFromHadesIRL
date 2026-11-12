import { useState, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, Pressable, View, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { ThemedView } from '@/components/themed-view';
import { DayStrip, VISIBLE_DAYS, type DayStripHandle } from '@/components/habits/day-strip';
import { SuccessColorPicker } from '@/components/habits/success-color-picker';
import { PhoneFreeSection } from '@/components/habits/phone-free-section';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords } from '@/hooks/use-habit-records';
import { useTodayDate } from '@/hooks/use-today-date';
import { useAuth } from '@/contexts/auth-context';
import { useRecordsContext } from '@/contexts/records-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSuccessColors } from '@/hooks/use-success-colors';
import { useVacationDays } from '@/hooks/use-vacation-days';
import type { TripleValue, QuadValue } from '@/types/habit';
import { isValueRecorded, recordLevel, valueGoalsOn } from '@/lib/habit-scoring';
import { addDays, formatDate, parseDate, weekStartOf } from '@/lib/date-utils';
import { useWeekStart } from '@/hooks/use-week-start';

/** Records are kept loaded this many days either side of the days on screen. */
const RECORDS_BUFFER_DAYS = 28;

export default function WeekViewScreen() {
  const { user } = useAuth();
  const { habits, isLoading: habitsLoading, isOffline, hasLoaded } = useHabits();
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const colors = Colors[scheme];
  const { colors: successColors } = useSuccessColors(scheme);
  const { days: vacationDays, isLoading: vacationLoading } = useVacationDays();
  const { width: screenWidth } = useWindowDimensions();

  // todayStr keeps "today" and the strip's end live across midnight — a
  // bare new Date() would freeze them at the mount day.
  const { todayStr } = useTodayDate();
  const { weekStartsOn } = useWeekStart();

  // Every day the strip can reach: from the start of the week the first
  // habit was created in, through the end of this week. Nothing past that
  // exists to show, so the strip stops there instead of paging into
  // empty future weeks.
  const days = useMemo(() => {
    const created = habits.reduce(
      (min, h) => (h.createdAt && h.createdAt < min ? h.createdAt : min),
      Number.POSITIVE_INFINITY,
    );
    const first = weekStartOf(Number.isFinite(created) ? formatDate(new Date(created)) : todayStr, weekStartsOn);
    const last = addDays(weekStartOf(todayStr, weekStartsOn), VISIBLE_DAYS - 1);
    const out: string[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
  }, [habits, todayStr, weekStartsOn]);
  const thisWeekIndex = Math.max(0, days.length - VISIBLE_DAYS);

  // The leftmost day on screen. Starts on this week's first day and follows
  // the scroll day by day.
  const [firstVisible, setFirstVisible] = useState(thisWeekIndex);
  const visibleDays = useMemo(
    () => days.slice(firstVisible, firstVisible + VISIBLE_DAYS),
    [days, firstVisible],
  );
  const dates = useMemo(() => visibleDays.map(parseDate), [visibleDays]);

  // Records for the days on screen plus a buffer either side, so scrolling
  // a few days never lands on empty cells. The provider keeps everything
  // it has loaded, so this only ever grows.
  const recordsStart = days[Math.max(0, firstVisible - RECORDS_BUFFER_DAYS)] ?? todayStr;
  const recordsEnd =
    days[Math.min(days.length - 1, firstVisible + VISIBLE_DAYS - 1 + RECORDS_BUFFER_DAYS)] ?? todayStr;
  const { recordsByDate, isLoading: recordsLoading } = useHabitRecords(recordsStart, recordsEnd);
  // Only the first load holds the screen; later loads (scrolling into
  // older days) fill cells in place.
  const [everLoaded, setEverLoaded] = useState(false);
  if (!recordsLoading && !everLoaded) setEverLoaded(true);
  const { recordHabit } = useRecordsContext();

  const handleTapHabit = useCallback(
    (habitId: string, date: string) => {
      if (!user) return;
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;
      // Steps and phone-free habits are auto-filled and meditation habits
      // open their own timer modal — none is editable from the week-view tap.
      if (
        habit.recordingMode === 'steps' ||
        habit.recordingMode === 'meditation' ||
        habit.recordingMode === 'phoneFree'
      )
        return;

      const existingRecords = recordsByDate[date];
      const existing = existingRecords?.get(habitId);

      let newValue: boolean | TripleValue | QuadValue | number | string;
      switch (habit.recordingMode) {
        case 'boolean':
          newValue = existing ? !existing.value : true;
          break;
        case 'triple': {
          const cur = (existing?.value as TripleValue) ?? 'no';
          newValue = cur === 'no' ? 'yes' : cur === 'yes' ? 'double' : 'no';
          break;
        }
        case 'quad':
        case 'creativeWriting': {
          const cur = (existing?.value as QuadValue) ?? 'no';
          newValue = cur === 'no' ? 'yes' : cur === 'yes' ? 'goal' : cur === 'goal' ? 'ideal' : 'no';
          break;
        }
        case 'counter':
          newValue = ((existing?.value as number) ?? 0) + 1;
          break;
        case 'value': {
          // With goals, a tap climbs to the next goal's amount (like cycling
          // quad tiers) and clears after the top one.
          const goals = valueGoalsOn(habit, date);
          if (goals.length > 0) {
            const level = recordLevel(habit, existing);
            newValue = level < goals.length ? String(goals[level]) : '';
            break;
          }
          // Without goals, just toggle presence. isValueRecorded, not
          // truthiness: a "0" cell renders unrecorded, so tapping it must
          // record ("1"), not clear an already-empty-looking cell.
          newValue = isValueRecorded(existing?.value) ? '' : '1';
          break;
        }
      }

      // Through the shared context path: optimistic local update, plus the
      // same offline guard every other mutation has (a direct setDoc here
      // bypassed both).
      recordHabit(habitId, date, newValue);
    },
    [user, habits, recordsByDate, recordHabit],
  );

  const stripRef = useRef<DayStripHandle | null>(null);
  const atStart = firstVisible <= 0;
  const atEnd = firstVisible >= thisWeekIndex;

  const weekLabel = useMemo(() => {
    if (dates.length === 0) return '';
    const start = dates[0];
    const end = dates[dates.length - 1];
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [dates]);

  // Hold until habits and the first stretch of records arrive — otherwise
  // the strip renders all-empty cells and then pops to the real data.
  // Offline before anything loaded keeps the loading treatment; listeners
  // retry on their own.
  if (
    habitsLoading ||
    (((recordsLoading && !everLoaded) || vacationLoading) && !isOffline) ||
    // hasLoaded, not habits.length: an account CONFIRMED empty keeps its
    // normal empty state (with its setup affordances) when the device goes
    // offline — only "offline before anything ever loaded" waits here.
    (isOffline && !hasLoaded)
  ) {
    return <LoadingScreen message={isOffline ? 'Waiting for connection...' : undefined} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          {atStart ? (
            <View style={styles.navButton} />
          ) : (
            <Pressable
              onPress={() => stripRef.current?.scrollToIndex(firstVisible - VISIBLE_DAYS)}
              style={styles.navButton}
              accessibilityRole="button"
              accessibilityLabel="Back a week"
            >
              <ThemedText style={styles.navText}>‹</ThemedText>
            </Pressable>
          )}
          <Pressable
            onPress={() => stripRef.current?.scrollToIndex(thisWeekIndex)}
            accessibilityRole="button"
            accessibilityLabel="Jump to this week"
          >
            <ThemedText type="defaultSemiBold" style={styles.weekLabel}>
              {weekLabel}
            </ThemedText>
          </Pressable>
          {atEnd ? (
            <View style={styles.navButton} />
          ) : (
            <Pressable
              onPress={() => stripRef.current?.scrollToIndex(firstVisible + VISIBLE_DAYS)}
              style={styles.navButton}
              accessibilityRole="button"
              accessibilityLabel="Forward a week"
            >
              <ThemedText style={styles.navText}>›</ThemedText>
            </Pressable>
          )}
        </View>

        {/* replace, not back(): history-walking lands on surprising siblings
            after deep links — see the back-to-parent invariant. */}
        <Pressable style={styles.backLink} onPress={() => router.replace('/(tabs)/(habits)')}>
          <ThemedText style={[styles.backText, { color: colors.tint }]}>← Day View</ThemedText>
        </Pressable>

        {habits.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ThemedText style={{ opacity: 0.5, fontSize: 16 }}>No habits yet</ThemedText>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
            <DayStrip
              handleRef={stripRef}
              days={days}
              todayStr={todayStr}
              width={screenWidth}
              habits={habits}
              recordsByDate={recordsByDate}
              onTapHabit={handleTapHabit}
              successColors={successColors}
              vacationDays={vacationDays}
              initialIndex={thisWeekIndex}
              onFirstVisibleChange={setFirstVisible}
            />
            <SuccessColorPicker />
            {/* Night-by-night detail for phone-free habits (start, end,
                pickups). Only once such a habit exists: setup lives in the
                habit editor and the tile modal. */}
            {habits.some((h) => h.recordingMode === 'phoneFree') && (
              <PhoneFreeSection dates={dates} />
            )}
          </ScrollView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navText: {
    fontSize: 28,
    fontWeight: '300',
  },
  weekLabel: {
    fontSize: 16,
  },
  backLink: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
