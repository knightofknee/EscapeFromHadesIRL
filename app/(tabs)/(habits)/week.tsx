import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeekGrid } from '@/components/habits/week-grid';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, getWeekDates } from '@/hooks/use-habit-records';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, setDoc } from '@/lib/firebase/firestore';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { HabitRecord, TripleValue } from '@/types/habit';

export default function WeekViewScreen() {
  const { user } = useAuth();
  const { habits } = useHabits();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [weekOffset, setWeekOffset] = useState(0);

  const refDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const { dates, startDate, endDate } = useMemo(() => getWeekDates(refDate), [refDate]);
  const { recordsByDate } = useHabitRecords(startDate, endDate);

  const handleTapHabit = useCallback(
    (habitId: string, date: string) => {
      if (!user) return;
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      const existingRecords = recordsByDate[date];
      const existing = existingRecords?.get(habitId);

      let newValue: boolean | TripleValue | number | string;
      switch (habit.recordingMode) {
        case 'boolean':
          newValue = existing ? !existing.value : true;
          break;
        case 'triple': {
          const cur = (existing?.value as TripleValue) ?? 'no';
          newValue = cur === 'no' ? 'yes' : cur === 'yes' ? 'double' : 'no';
          break;
        }
        case 'counter':
          newValue = ((existing?.value as number) ?? 0) + 1;
          break;
        case 'value':
          // For week view, just toggle presence
          newValue = existing?.value ? '' : '1';
          break;
      }

      const docId = `${habitId}_${date}`;
      const record: HabitRecord = {
        id: docId,
        habitId,
        userId: user.uid,
        date,
        value: newValue,
        recordedAt: Date.now(),
      };
      setDoc(doc(db, 'records', docId), record);
    },
    [user, habits, recordsByDate],
  );

  const weekLabel = useMemo(() => {
    const start = dates[0];
    const end = dates[6];
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [dates]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setWeekOffset((o) => o - 1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>‹</ThemedText>
          </Pressable>
          <Pressable onPress={() => setWeekOffset(0)}>
            <ThemedText type="defaultSemiBold" style={styles.weekLabel}>
              {weekLabel}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => setWeekOffset((o) => o + 1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>›</ThemedText>
          </Pressable>
        </View>

        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <ThemedText style={[styles.backText, { color: colors.tint }]}>← Day View</ThemedText>
        </Pressable>

        <WeekGrid
          dates={dates}
          habits={habits}
          recordsByDate={recordsByDate}
          onTapHabit={handleTapHabit}
        />
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
