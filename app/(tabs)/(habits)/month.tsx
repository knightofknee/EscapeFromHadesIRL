import { useState, useMemo } from 'react';
import { StyleSheet, ScrollView, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, formatDate } from '@/hooks/use-habit-records';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Habit, HabitRecord } from '@/types/habit';

function isCompleted(habit: Habit, record?: HabitRecord): boolean {
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
    default:
      return false;
  }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function MonthViewScreen() {
  const { habits } = useHabits();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [monthOffset, setMonthOffset] = useState(0);

  const { year, month, daysInMonth, startDate, endDate, monthLabel } = useMemo(() => {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const y = target.getFullYear();
    const m = target.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    return {
      year: y,
      month: m,
      daysInMonth: dim,
      startDate: formatDate(new Date(y, m, 1)),
      endDate: formatDate(new Date(y, m, dim)),
      monthLabel: `${MONTH_NAMES[m]} ${y}`,
    };
  }, [monthOffset]);

  const { records } = useHabitRecords(startDate, endDate);

  // Index records by habitId_date for O(1) lookups
  const recordIndex = useMemo(() => {
    const map = new Map<string, HabitRecord>();
    for (const r of records) {
      map.set(`${r.habitId}_${r.date}`, r);
    }
    return map;
  }, [records]);

  // Build calendar grid
  const calendarWeeks = useMemo(() => {
    const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = new Array(firstDayOfWeek).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push(d);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }
    return weeks;
  }, [year, month, daysInMonth]);

  // For current month, only count up to yesterday (today still in progress)
  const countDays = useMemo(() => {
    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth()) {
      return Math.max(1, now.getDate() - 1);
    }
    return daysInMonth;
  }, [year, month, daysInMonth]);

  // Per-habit completion rate for the month
  const habitRates = useMemo(() => {
    return habits.map((habit) => {
      let completed = 0;
      for (let d = 1; d <= countDays; d++) {
        const dateStr = formatDate(new Date(year, month, d));
        const record = recordIndex.get(`${habit.id}_${dateStr}`);
        if (isCompleted(habit, record)) completed++;
      }
      const rate = countDays > 0 ? Math.round((completed / countDays) * 100) : 0;
      return { habit, completed, rate };
    });
  }, [habits, recordIndex, year, month, countDays]);

  // Heatmap data: for each day, weighted score of habit completion
  // Base completion = 1.0, goal/double = 1.25, ideal = 1.5
  const dayCompletionMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (habits.length === 0) return map;
    // Max possible per habit is 1.5 (ideal), so max total = habits.length * 1.5
    const maxPerHabit = 1.5;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDate(new Date(year, month, d));
      let score = 0;
      for (const habit of habits) {
        const record = recordIndex.get(`${habit.id}_${dateStr}`);
        if (!record) continue;
        const v = record.value;
        if (v === 'ideal') score += 1.5;
        else if (v === 'goal' || v === 'double') score += 1.25;
        else if (isCompleted(habit, record)) score += 1.0;
      }
      map[d] = score / (habits.length * maxPerHabit);
    }
    return map;
  }, [habits, recordIndex, year, month, daysInMonth]);

  function heatmapColor(ratio: number): string {
    if (ratio === 0) return colors.tileUnrecorded;
    // Map ratio to hex opacity: 0.01 → 30, 1.0 → FF
    const opacity = Math.round(0x30 + (0xFF - 0x30) * Math.min(ratio, 1));
    return `${colors.tileRecorded}${opacity.toString(16).padStart(2, '0').toUpperCase()}`;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setMonthOffset((o) => o - 1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>‹</ThemedText>
          </Pressable>
          <Pressable onPress={() => setMonthOffset(0)}>
            <ThemedText type="defaultSemiBold" style={styles.monthLabel}>{monthLabel}</ThemedText>
          </Pressable>
          <Pressable onPress={() => setMonthOffset((o) => o + 1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>›</ThemedText>
          </Pressable>
        </View>

        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <ThemedText style={[styles.backText, { color: colors.tint }]}>← Day View</ThemedText>
        </Pressable>

        {habits.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ThemedText style={{ opacity: 0.5, fontSize: 16 }}>No habits yet</ThemedText>
          </View>
        ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Calendar heatmap */}
          <View style={styles.calendarSection}>
            <View style={styles.weekdayHeaders}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <ThemedText key={i} style={styles.weekdayLabel}>{d}</ThemedText>
              ))}
            </View>
            {calendarWeeks.map((week, wi) => (
              <View key={wi} style={styles.calendarRow}>
                {week.map((day, di) => (
                  <View
                    key={di}
                    style={[
                      styles.calendarCell,
                      {
                        backgroundColor: day ? heatmapColor(dayCompletionMap[day] ?? 0) : 'transparent',
                      },
                    ]}
                  >
                    {day && (
                      <ThemedText style={styles.calendarDayText}>{day}</ThemedText>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>

          {/* Per-habit rates */}
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Habit Completion
          </ThemedText>
          {habitRates.map(({ habit, completed, rate }) => (
            <View key={habit.id} style={[styles.habitRow, { borderColor: colors.tileBorder }]}>
              <View style={styles.habitInfo}>
                <ThemedText style={[styles.habitAbbr, { color: habit.color }]}>
                  {habit.icon ?? habit.abbreviation}
                </ThemedText>
                <ThemedText style={styles.habitName}>{habit.name}</ThemedText>
              </View>
              <View style={styles.habitStats}>
                <ThemedText style={styles.rateText}>{rate}%</ThemedText>
                <ThemedText style={styles.countText}>
                  {completed}/{countDays}
                </ThemedText>
              </View>
              <View style={[styles.rateBar, { backgroundColor: colors.tileUnrecorded }]}>
                <View
                  style={[styles.rateFill, { width: `${rate}%`, backgroundColor: habit.color }]}
                />
              </View>
            </View>
          ))}
        </ScrollView>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  navButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  navText: { fontSize: 28, fontWeight: '300' },
  monthLabel: { fontSize: 18 },
  backLink: { paddingHorizontal: 16, paddingBottom: 8 },
  backText: { fontSize: 14, fontWeight: '600' },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 16 },
  calendarSection: { gap: 4 },
  weekdayHeaders: { flexDirection: 'row', gap: 4 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 12, opacity: 0.5, fontWeight: '600' },
  calendarRow: { flexDirection: 'row', gap: 4 },
  calendarCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayText: { fontSize: 11, fontWeight: '500' },
  sectionTitle: { fontSize: 16, marginTop: 8 },
  habitRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  habitInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  habitAbbr: { fontSize: 16, fontWeight: '700' },
  habitName: { fontSize: 14 },
  habitStats: { flexDirection: 'row', justifyContent: 'space-between' },
  rateText: { fontSize: 20, fontWeight: '700' },
  countText: { fontSize: 14, opacity: 0.5, alignSelf: 'flex-end' },
  rateBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 3 },
});
