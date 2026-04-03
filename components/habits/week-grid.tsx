import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WeekColumn } from './week-column';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDate } from '@/lib/date-utils';
import type { Habit, HabitRecord } from '@/types/habit';
import type { SuccessColors } from '@/hooks/use-success-colors';

type WeekGridProps = {
  dates: Date[];
  habits: Habit[];
  recordsByDate: Record<string, Map<string, HabitRecord>>;
  onTapHabit: (habitId: string, date: string) => void;
  successColors: SuccessColors;
};

export function WeekGrid({ dates, habits, recordsByDate, onTapHabit, successColors }: WeekGridProps) {
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
            successColors={successColors}
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
    minHeight: 300,
  },
});
