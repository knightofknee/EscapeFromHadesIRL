import { StyleSheet, Pressable, View, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDate } from '@/lib/date-utils';
import { readableTextOn } from '@/lib/contrast';
import type { Habit, HabitRecord, VacationDay } from '@/types/habit';
import type { SuccessColors } from '@/hooks/use-success-colors';
import { recordLevel } from '@/lib/habit-scoring';

type WeekColumnProps = {
  date: Date;
  isToday: boolean;
  habits: Habit[];
  records: Map<string, HabitRecord>;
  onTapHabit: (habitId: string, date: string) => void;
  successColors: SuccessColors;
  vacation?: VacationDay;
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getStateColor(
  habit: Habit,
  record: HabitRecord | undefined,
  successColors: SuccessColors,
): string {
  // The four success colors are exactly recordLevel's 0-3 scale — derive
  // instead of re-encoding the mode→tier table (which is how the value-mode
  // "0" rule had to be patched here separately).
  const byLevel = [
    successColors.unrecorded,
    successColors.recorded,
    successColors.double,
    successColors.triple,
  ] as const;
  return byLevel[recordLevel(habit, record)] ?? successColors.unrecorded;
}

export function WeekColumn({ date, isToday, habits, records, onTapHabit, successColors, vacation }: WeekColumnProps) {
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
      {vacation ? (
        // Vacation day: replace the habit-tile column with a single V tile.
        // Tap is a no-op here — the home screen is the place to edit.
        <View style={styles.tiles}>
          <View style={[styles.vacationTile, { backgroundColor: vacation.color }]}>
            <ThemedText
              style={[styles.vacationLabel, { color: readableTextOn(vacation.color) }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {vacation.label.trim() || 'V'}
            </ThemedText>
          </View>
        </View>
      ) : (
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
      )}
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
  vacationTile: {
    width: '90%',
    flex: 1,
    minHeight: 60,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacationLabel: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
