import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, ScrollView, View, Pressable, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StatsCard } from '@/components/habits/stats-card';
import { StatsChart } from '@/components/habits/stats-chart';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, formatDate } from '@/hooks/use-habit-records';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Habit, HabitRecord } from '@/types/habit';

type CompletionChecker = (habit: Habit, record?: HabitRecord) => boolean;

// Level 0: any completion (yes/double for triple, yes/goal/ideal for quad)
function isRecordCompleted(habit: Habit, record?: HabitRecord): boolean {
  if (!record) return false;
  switch (habit.recordingMode) {
    case 'boolean':
      return record.value !== false && record.value !== 'no';
    case 'triple':
      return record.value === 'yes' || record.value === 'double';
    case 'quad':
      return record.value === 'yes' || record.value === 'goal' || record.value === 'ideal';
    case 'counter':
      return (record.value as number) > 0;
    case 'value':
      return !!(record.value as string);
  }
}

// Level 1: goal or above
function isRecordGoal(habit: Habit, record?: HabitRecord): boolean {
  if (!record) return false;
  switch (habit.recordingMode) {
    case 'triple':
      return record.value === 'double';
    case 'quad':
      return record.value === 'goal' || record.value === 'ideal';
    default:
      return false;
  }
}

// Level 2: ideal only
function isRecordIdeal(_habit: Habit, record?: HabitRecord): boolean {
  if (!record) return false;
  return record.value === 'ideal';
}

const LEVEL_CHECKERS: CompletionChecker[] = [isRecordCompleted, isRecordGoal, isRecordIdeal];

function getLevelLabel(habit: Habit, levelIndex: number): string {
  if (levelIndex === 0) return habit.name;
  if (levelIndex === 1) return `${habit.name} — Goal`;
  return `${habit.name} — Ideal`;
}

function getPageCount(habit: Habit): number {
  if (habit.recordingMode === 'quad') return 3;
  if (habit.recordingMode === 'triple') return 2;
  return 1;
}

function computeStreak(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  checker: CompletionChecker,
): { current: number; longest: number } {
  let current = 0;
  let longest = 0;
  let streak = 0;
  let isCurrent = true;

  const today = new Date();
  const todayStr = formatDate(today);
  const todayRecord = recordIndex.get(`${habit.id}_${todayStr}`);
  const todayCompleted = checker(habit, todayRecord);

  const checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() - 1);

  for (let i = 0; i < 548; i++) {
    const dateStr = formatDate(checkDate);
    const record = recordIndex.get(`${habit.id}_${dateStr}`);
    const completed = checker(habit, record);

    if (completed) {
      streak++;
      if (isCurrent) current = streak;
    } else {
      if (isCurrent) isCurrent = false;
      longest = Math.max(longest, streak);
      streak = 0;
    }

    checkDate.setDate(checkDate.getDate() - 1);
  }
  longest = Math.max(longest, streak);

  if (todayCompleted) current++;

  return { current, longest };
}

function computeMonthlyRates(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  displayMonths: number,
  checker: CompletionChecker,
): { date: string; value: number; avg: number }[] {
  const now = new Date();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  // Compute 36 months of raw rates for rolling average calculation
  const totalMonths = 36;
  const allRates: { date: string; rate: number }[] = [];

  for (let m = totalMonths - 1; m >= 0; m--) {
    const monthDate = new Date(todayYear, todayMonth - m, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const isCurrentMonth = year === todayYear && month === todayMonth;
    const countDays = isCurrentMonth ? Math.max(1, todayDate - 1) : daysInMonth;

    let completed = 0;
    for (let d = 1; d <= countDays; d++) {
      const dateStr = formatDate(new Date(year, month, d));
      const record = recordIndex.get(`${habit.id}_${dateStr}`);
      if (checker(habit, record)) completed++;
    }

    const rate = Math.round((completed / countDays) * 100);
    const label = `${year}-${String(month + 1).padStart(2, '0')}`;
    allRates.push({ date: label, rate });
  }

  // Return last displayMonths with rolling average (average of all months up to and including current)
  const result: { date: string; value: number; avg: number }[] = [];
  const startIdx = totalMonths - displayMonths;

  for (let i = startIdx; i < totalMonths; i++) {
    const { date, rate } = allRates[i];
    // Rolling average: average of all months from start up to this one
    let sum = 0;
    let count = 0;
    for (let j = 0; j <= i; j++) {
      if (allRates[j].rate > 0 || j >= startIdx) {
        sum += allRates[j].rate;
        count++;
      }
    }
    const avg = count > 0 ? Math.round(sum / count) : 0;
    result.push({ date, value: rate, avg });
  }

  return result;
}

function computeRates(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  checker: CompletionChecker,
): { week: number; month: number; quarter: number } {
  const now = new Date();
  const rates = { week: 0, month: 0, quarter: 0 };

  for (const [period, days] of [
    ['week', 7],
    ['month', 30],
    ['quarter', 90],
  ] as const) {
    let completed = 0;
    for (let d = 1; d <= days; d++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() - d);
      const dateStr = formatDate(checkDate);
      const record = recordIndex.get(`${habit.id}_${dateStr}`);
      if (checker(habit, record)) completed++;
    }
    rates[period] = Math.round((completed / days) * 100);
  }

  return rates;
}

// --- Swipeable habit stats section ---

type HabitStatsSectionProps = {
  habit: Habit;
  recordIndex: Map<string, HabitRecord>;
};

function StatsPageContent({
  habit,
  recordIndex,
  checker,
  colors,
}: {
  habit: Habit;
  recordIndex: Map<string, HabitRecord>;
  checker: CompletionChecker;
  colors: (typeof Colors)['light'];
}) {
  const { current, longest } = useMemo(
    () => computeStreak(habit, recordIndex, checker),
    [habit, recordIndex, checker],
  );
  const rates = useMemo(
    () => computeRates(habit, recordIndex, checker),
    [habit, recordIndex, checker],
  );
  const monthlyData = useMemo(
    () => computeMonthlyRates(habit, recordIndex, 18, checker),
    [habit, recordIndex, checker],
  );

  return (
    <>
      <View style={styles.statsRow}>
        <StatsCard label="Current Streak" value={current} subtitle="days" color={colors.tileRecorded} />
        <StatsCard label="Longest Streak" value={longest} subtitle="days" color={colors.tileDouble} />
      </View>
      <View style={styles.statsRow}>
        <StatsCard label="7 Days" value={`${rates.week}%`} />
        <StatsCard label="30 Days" value={`${rates.month}%`} />
        <StatsCard label="90 Days" value={`${rates.quarter}%`} />
      </View>
      <StatsChart
        data={monthlyData}
        title="Monthly Completion Rate"
        color={habit.color}
      />
    </>
  );
}

function HabitStatsSection({ habit, recordIndex }: HabitStatsSectionProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const pageCount = getPageCount(habit);
  const [pageIndex, setPageIndex] = useState(0);

  const translateX = useSharedValue(0);
  const contentWidth = Dimensions.get('window').width - 32; // minus scrollContent padding
  const SWIPE_THRESHOLD = contentWidth * 0.15;

  const changePage = useCallback((direction: number) => {
    setPageIndex((i) => {
      const next = i + direction;
      if (next < 0 || next >= pageCount) return i;
      return next;
    });
  }, [pageCount]);

  const canSwipe = useCallback((direction: number) => {
    'worklet';
    // direction 1 = swiping left (next page), -1 = swiping right (prev page)
    if (direction === 1) return pageIndex < pageCount - 1;
    return pageIndex > 0;
  }, [pageIndex, pageCount]);

  const swipeGesture = useMemo(() => {
    if (pageCount <= 1) return null;
    return Gesture.Pan()
      .activeOffsetX([-20, 20])
      .failOffsetY([-10, 10])
      .onUpdate((e) => {
        // Clamp drag if at boundary
        const direction = e.translationX < 0 ? 1 : -1;
        if (!canSwipe(direction)) {
          translateX.value = e.translationX * 0.2; // rubber band
        } else {
          translateX.value = e.translationX;
        }
      })
      .onEnd((e) => {
        const direction = e.translationX > 0 ? -1 : 1;
        if (canSwipe(direction) && (Math.abs(e.translationX) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > 500)) {
          // Snap: offset translateX to absorb the page change, then animate to 0
          translateX.value = translateX.value + direction * -contentWidth;
          runOnJS(changePage)(direction);
          translateX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        } else {
          translateX.value = withTiming(0, { duration: 150 });
        }
      });
  }, [pageCount, pageIndex, changePage, canSwipe, translateX, contentWidth, SWIPE_THRESHOLD]);

  // All pages laid out in a horizontal row; translate the row
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -pageIndex * contentWidth + translateX.value }],
  }));

  const showLeft = pageCount > 1 && pageIndex > 0;
  const showRight = pageCount > 1 && pageIndex < pageCount - 1;

  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(
      <View key={i} style={{ width: contentWidth }}>
        <View style={styles.statsContent}>
          <StatsPageContent habit={habit} recordIndex={recordIndex} checker={LEVEL_CHECKERS[i]} colors={colors} />
        </View>
      </View>,
    );
  }

  return (
    <View style={styles.habitSection}>
      <View style={styles.habitHeader}>
        {showLeft ? (
          <Pressable onPress={() => changePage(-1)} style={styles.navArrow}>
            <ThemedText style={styles.navArrowText}>‹</ThemedText>
          </Pressable>
        ) : pageCount > 1 ? (
          <View style={styles.navArrow} />
        ) : null}
        <View style={styles.habitTitleRow}>
          <ThemedText style={[styles.habitIcon, { color: habit.color }]}>
            {habit.icon ?? habit.abbreviation}
          </ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.habitName} numberOfLines={1}>
            {getLevelLabel(habit, pageIndex)}
          </ThemedText>
        </View>
        {showRight ? (
          <Pressable onPress={() => changePage(1)} style={styles.navArrow}>
            <ThemedText style={styles.navArrowText}>›</ThemedText>
          </Pressable>
        ) : pageCount > 1 ? (
          <View style={styles.navArrow} />
        ) : null}
      </View>

      {pageCount <= 1 ? (
        <View style={styles.statsContent}>
          <StatsPageContent habit={habit} recordIndex={recordIndex} checker={LEVEL_CHECKERS[0]} colors={colors} />
        </View>
      ) : (
        <View style={{ overflow: 'hidden', width: contentWidth }}>
          <GestureDetector gesture={swipeGesture!}>
            <Animated.View style={[{ flexDirection: 'row', width: contentWidth * pageCount }, rowStyle]}>
              {pages}
            </Animated.View>
          </GestureDetector>
        </View>
      )}
    </View>
  );
}

// --- Main screen ---

export default function StatsScreen() {
  const { habits } = useHabits();

  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 36);
    return { startDate: formatDate(start), endDate: formatDate(end) };
  }, []);

  const { records } = useHabitRecords(dateRange.startDate, dateRange.endDate);

  const recordIndex = useMemo(() => {
    const map = new Map<string, HabitRecord>();
    for (const r of records) {
      map.set(`${r.habitId}_${r.date}`, r);
    }
    return map;
  }, [records]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText style={styles.subtitle}>18-month rolling view</ThemedText>

        {habits.length === 0 ? (
          <ThemedText style={styles.empty}>No habits to show stats for</ThemedText>
        ) : (
          habits.map((habit) => (
            <HabitStatsSection key={habit.id} habit={habit} recordIndex={recordIndex} />
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 24,
  },
  subtitle: {
    opacity: 0.5,
    marginTop: -16,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 40,
    opacity: 0.5,
  },
  habitSection: {
    gap: 10,
  },
  habitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  habitTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  habitIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
  habitName: {
    fontSize: 18,
    flexShrink: 1,
  },
  navArrow: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowText: {
    fontSize: 28,
    fontWeight: '300',
  },
  statsContent: {
    gap: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
});
