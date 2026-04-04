import type { Habit, HabitRecord } from '@/types/habit';

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
