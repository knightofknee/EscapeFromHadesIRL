import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WeekColumn } from './week-column';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDate } from '@/lib/date-utils';
import type { Habit, HabitRecord } from '@/types/habit';

type WeekGridProps = {
  dates: Date[];
  habits: Habit[];
  recordsByDate: Record<string, Map<string, HabitRecord>>;
  onTapHabit: (habitId: string, date: string) => void;
};

export function WeekGrid({ dates, habits, recordsByDate, onTapHabit }: WeekGridProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const today = formatDate(new Date());
  const emptyMap = useRef(new Map<string, HabitRecord>()).current;

  return (
    <View style={[styles.container, { backgroundColor: colors.gridBackground }]}>
      {dates.map((date) => {
        const dateStr = formatDate(date);
        return (
          <WeekColumn
            key={dateStr}
            date={date}
            isToday={dateStr === today}
            habits={habits}
            records={recordsByDate[dateStr] ?? emptyMap}
            onTapHabit={onTapHabit}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 2,
    padding: 4,
    borderRadius: 8,
    flex: 1,
  },
});
