import type { Habit, HabitRecord } from '@/types/habit';
import type { RecordingMode } from '@/types/habit';
import { isWeekend } from '@/lib/date-utils';

/** Recording modes with success tiers (yes/goal/ideal) — the only modes a
 * goal/ideal quest bar can be satisfied by. One list, shared everywhere. */
const TIERED_MODES: RecordingMode[] = ['quad', 'steps', 'meditation', 'creativeWriting'];
export function isTieredMode(mode: RecordingMode): boolean {
  return TIERED_MODES.includes(mode);
}

export type CompletionChecker = (habit: Habit, record?: HabitRecord) => boolean;

/**
 * Success level of a record on ONE unified 0-3 scale across every recording
 * mode: 0 none, 1 basic, 2 goal (triple's "double"), 3 ideal. A boolean
 * habit tops out at 1, a triple at 2, quad-family habits reach 3. This is
 * the single mode→tier table — the completion checkers below and all quest
 * scoring derive from it, so the app can't disagree with itself about what
 * a record is worth.
 */
export function recordLevel(habit: Habit, record?: HabitRecord): number {
  if (!record) return 0;
  const v = record.value;
  switch (habit.recordingMode) {
    case 'boolean':
      return v !== false && v !== 'no' && v != null ? 1 : 0;
    case 'triple':
      return v === 'double' ? 2 : v === 'yes' ? 1 : 0;
    case 'steps':
    case 'meditation':
    case 'creativeWriting':
    case 'quad':
      return v === 'ideal' ? 3 : v === 'goal' ? 2 : v === 'yes' ? 1 : 0;
    case 'counter':
      return (v as number) > 0 ? 1 : 0;
    case 'value':
      return v ? 1 : 0;
    default:
      return 0;
  }
}

// Tier checkers, derived from the unified scale.
export function isRecordCompleted(habit: Habit, record?: HabitRecord): boolean {
  return recordLevel(habit, record) >= 1;
}

export function isRecordGoal(habit: Habit, record?: HabitRecord): boolean {
  return recordLevel(habit, record) >= 2;
}

export function isRecordIdeal(habit: Habit, record?: HabitRecord): boolean {
  return recordLevel(habit, record) >= 3;
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
