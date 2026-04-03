import { StyleSheet, Pressable, View, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDate } from '@/lib/date-utils';
import type { Habit, HabitRecord, TripleValue, QuadValue } from '@/types/habit';
import type { SuccessColors } from '@/hooks/use-success-colors';

type WeekColumnProps = {
  date: Date;
  isToday: boolean;
  habits: Habit[];
  records: Map<string, HabitRecord>;
  onTapHabit: (habitId: string, date: string) => void;
  successColors: SuccessColors;
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getStateColor(
  habit: Habit,
  record: HabitRecord | undefined,
  successColors: SuccessColors,
): string {
  if (!record) return successColors.unrecorded;
  switch (habit.recordingMode) {
    case 'boolean':
      return record.value === true ? successColors.recorded : successColors.unrecorded;
    case 'triple': {
      const v = record.value as TripleValue;
      return v === 'double' ? successColors.double : v === 'yes' ? successColors.recorded : successColors.unrecorded;
    }
    case 'quad': {
      const q = record.value as QuadValue;
      return q === 'ideal' ? successColors.triple : q === 'goal' ? successColors.double : q === 'yes' ? successColors.recorded : successColors.unrecorded;
    }
    case 'counter':
      return (record.value as number) > 0 ? successColors.recorded : successColors.unrecorded;
    case 'value':
      return (record.value as string) ? successColors.recorded : successColors.unrecorded;
  }
}

export function WeekColumn({ date, isToday, habits, records, onTapHabit, successColors }: WeekColumnProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const dayIndex = (date.getDay() + 6) % 7; // Monday=0
  const dateStr = formatDate(date);

  return (
    <View style={[styles.column, isToday && { backgroundColor: `${colors.tint}10` }]}>
      <View style={styles.header}>
        <ThemedText style={[styles.dayName, isToday && { color: colors.tint, fontWeight: '700' }]}>
          {DAY_NAMES[dayIndex]}
        </ThemedText>
        <ThemedText style={[styles.dayNumber, isToday && { color: colors.tint }]}>
          {date.getDate()}
        </ThemedText>
      </View>
      <View style={styles.tiles}>
        {habits.map((habit) => {
          const record = records.get(habit.id);
          const stateColor = getStateColor(habit, record, successColors);

          return (
            <Pressable
              key={habit.id}
              style={[styles.miniTile, { backgroundColor: stateColor }]}
              onPress={() => {
                if (Platform.OS === 'ios' && !Platform.isPad) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onTapHabit(habit.id, dateStr);
              }}
            >
              <ThemedText style={[styles.miniLabel, { color: '#fff' }]} numberOfLines={1}>
                {habit.icon ?? habit.abbreviation}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 4,
  },
  header: {
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  dayName: {
    fontSize: 11,
    fontWeight: '600',
  },
  dayNumber: {
    fontSize: 13,
    fontWeight: '500',
  },
  tiles: {
    paddingTop: 4,
    gap: 3,
    alignItems: 'center',
  },
  miniTile: {
    width: '90%',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRadius: 4,
    alignItems: 'center',
  },
  miniLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
});
