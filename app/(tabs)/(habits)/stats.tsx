import { useMemo } from 'react';
import { StyleSheet, ScrollView, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StatsCard } from '@/components/habits/stats-card';
import { StatsChart } from '@/components/habits/stats-chart';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, formatDate } from '@/hooks/use-habit-records';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Habit, HabitRecord, TripleValue } from '@/types/habit';

function isRecordCompleted(habit: Habit, record?: HabitRecord): boolean {
  if (!record) return false;
  switch (habit.recordingMode) {
    case 'boolean':
      return record.value === true;
    case 'triple':
      return record.value === 'yes' || record.value === 'double';
    case 'counter':
      return (record.value as number) > 0;
    case 'value':
      return !!(record.value as string);
  }
}

function computeStreak(habit: Habit, records: HabitRecord[]): { current: number; longest: number } {
  const habitRecords = records
    .filter((r) => r.habitId === habit.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  let current = 0;
  let longest = 0;
  let streak = 0;
  let isCurrent = true;

  // Walk backwards from today
  const today = new Date();
  const checkDate = new Date(today);

  for (let i = 0; i < 548; i++) {
    // 18 months
    const dateStr = formatDate(checkDate);
    const record = habitRecords.find((r) => r.date === dateStr);
    const completed = isRecordCompleted(habit, record);

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

  return { current, longest };
}

function computeMonthlyRates(
  habit: Habit,
  records: HabitRecord[],
  months: number,
): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  const now = new Date();

  for (let m = months - 1; m >= 0; m--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let completed = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDate(new Date(year, month, d));
      const record = records.find((r) => r.habitId === habit.id && r.date === dateStr);
      if (isRecordCompleted(habit, record)) completed++;
    }

    const rate = Math.round((completed / daysInMonth) * 100);
    const label = `${year}-${String(month + 1).padStart(2, '0')}`;
    result.push({ date: label, value: rate });
  }

  return result;
}

export default function StatsScreen() {
  const { habits } = useHabits();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // 18-month range
  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 18);
    return { startDate: formatDate(start), endDate: formatDate(end) };
  }, []);

  const { records } = useHabitRecords(dateRange.startDate, dateRange.endDate);

  const habitStats = useMemo(() => {
    return habits.map((habit) => {
      const { current, longest } = computeStreak(habit, records);

      // Completion rate for different periods
      const now = new Date();
      const rates = {
        week: 0,
        month: 0,
        quarter: 0,
        year: 0,
      };

      for (const [period, days] of [
        ['week', 7],
        ['month', 30],
        ['quarter', 90],
        ['year', 365],
      ] as const) {
        let completed = 0;
        for (let d = 0; d < days; d++) {
          const checkDate = new Date(now);
          checkDate.setDate(now.getDate() - d);
          const dateStr = formatDate(checkDate);
          const record = records.find((r) => r.habitId === habit.id && r.date === dateStr);
          if (isRecordCompleted(habit, record)) completed++;
        }
        rates[period] = Math.round((completed / days) * 100);
      }

      const monthlyData = computeMonthlyRates(habit, records, 18);

      return { habit, current, longest, rates, monthlyData };
    });
  }, [habits, records]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type="title" style={styles.title}>
          Statistics
        </ThemedText>
        <ThemedText style={styles.subtitle}>18-month rolling view</ThemedText>

        {habitStats.length === 0 ? (
          <ThemedText style={styles.empty}>No habits to show stats for</ThemedText>
        ) : (
          habitStats.map(({ habit, current, longest, rates, monthlyData }) => (
            <View key={habit.id} style={styles.habitSection}>
              <View style={styles.habitHeader}>
                <ThemedText style={[styles.habitIcon, { color: habit.color }]}>
                  {habit.icon ?? habit.abbreviation}
                </ThemedText>
                <ThemedText type="defaultSemiBold" style={styles.habitName}>
                  {habit.name}
                </ThemedText>
              </View>

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
            </View>
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
  title: {
    fontSize: 28,
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
    gap: 8,
  },
  habitIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
  habitName: {
    fontSize: 18,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
});
