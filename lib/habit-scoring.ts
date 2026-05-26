import type { Habit, HabitRecord } from '@/types/habit';
import { isWeekend } from '@/lib/date-utils';

export type CompletionChecker = (habit: Habit, record?: HabitRecord) => boolean;

// Level 0: any completion
export function isRecordCompleted(habit: Habit, record?: HabitRecord): boolean {
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

// Level 1: goal or above
export function isRecordGoal(habit: Habit, record?: HabitRecord): boolean {
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
export function isRecordIdeal(_habit: Habit, record?: HabitRecord): boolean {
  if (!record) return false;
  return record.value === 'ideal';
}

export const LEVEL_CHECKERS: CompletionChecker[] = [isRecordCompleted, isRecordGoal, isRecordIdeal];

/**
 * "Win only Weekends" rule: when the user enables it, weekend days where
 * a habit wasn't completed at the relevant level are treated as skipped
 * (not counted as a miss, not counted at all). Mirrors vacation-day
 * semantics but at (habit, date) granularity instead of a blanket per-day
 * mask — a Saturday where one habit was done and another wasn't counts
 * the first and silently drops the second.
 *
 * Pass the same `checker` the surrounding stat uses so the skip threshold
 * matches the level being computed. For UI that has no level concept
 * (heatmap dots, day-level rollups), the default of `isRecordCompleted`
 * gives the lenient "did anything = counted" reading.
 */
export function shouldSkipWeekend(
  habit: Habit,
  record: HabitRecord | undefined,
  dateStr: string,
  winOnlyWeekends: boolean,
  checker: CompletionChecker = isRecordCompleted,
): boolean {
  if (!winOnlyWeekends) return false;
  if (!isWeekend(dateStr)) return false;
  return !checker(habit, record);
}
