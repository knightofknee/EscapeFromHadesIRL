import type { Habit, HabitRecord } from '@/types/habit';
import type { RecordingMode } from '@/types/habit';
import { isWeekend } from '@/lib/date-utils';

/** Recording modes with success tiers (yes/goal/ideal) — the only modes a
 * goal/ideal quest bar can be satisfied by. One list, shared everywhere. */
const TIERED_MODES: RecordingMode[] = ['quad', 'steps', 'meditation', 'creativeWriting', 'phoneFree'];
export function isTieredMode(mode: RecordingMode): boolean {
  return TIERED_MODES.includes(mode);
}

/** Can this habit reach the goal/ideal tiers? The quad-family modes always
 * can; a value habit can once it has 2+ goals (goal 3 is the star). Quests
 * use this to offer and enforce goal/ideal bars. */
export function isTieredHabit(habit: Habit): boolean {
  if (isTieredMode(habit.recordingMode)) return true;
  return habit.recordingMode === 'value' && (habit.valueGoals?.length ?? 0) >= 2;
}

/** Month key used by valueGoalHistory ('YYYY-MM'). */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * The value goals in effect on `date`: the latest history entry whose month
 * is on or before the date's month, so a finished month is scored by the
 * goals it had. No entry yet → no goals. Habits without a history fall back
 * to their current goals.
 */
export function valueGoalsOn(habit: Habit, date: string | undefined): number[] {
  const history = habit.valueGoalHistory;
  if (!history?.length || !date) return habit.valueGoals ?? [];
  const month = monthKey(date);
  let goals: number[] = [];
  for (const entry of history) {
    if (entry.from <= month) goals = entry.goals;
    else break;
  }
  return goals;
}

/**
 * History after setting `goals` in `month`: that month's entry is replaced
 * (edits within a month keep refining it), earlier months are untouched.
 * A habit that had goals but no history (pre-history) gets its old goals
 * pinned as the since-the-beginning entry first.
 */
export function nextValueGoalHistory(
  habit: Habit | undefined,
  goals: number[],
  month: string,
): { from: string; goals: number[] }[] {
  const history = [...(habit?.valueGoalHistory ?? [])];
  if (history.length === 0 && habit?.valueGoals?.length) {
    history.push({ from: '0000-00', goals: habit.valueGoals });
  }
  const kept = history.filter((e) => e.from < month);
  // A brand-new habit has no past to protect: its goals apply from the start.
  const from = habit ? month : '0000-00';
  return [...kept, { from, goals }];
}

export type CompletionChecker = (habit: Habit, record?: HabitRecord) => boolean;

/**
 * Is a free-form value entry actually recorded? Value habits store the raw
 * string, and users treat them as tallies they increment through the day —
 * so "0" (or "0.0", or a cleared field) means "back to nothing", not "done".
 * A string is unrecorded when it's empty or parses to exactly zero;
 * non-numeric text (e.g. "skipped early") still counts as an entry. Every
 * value-mode completion check must route through here — a bare truthiness
 * test reads the string "0" as done.
 */
export function isValueRecorded(v: unknown): boolean {
  if (v == null) return false;
  const str = String(v).trim();
  if (str === '') return false;
  const n = Number(str);
  return Number.isNaN(n) || n !== 0;
}

/**
 * Tier of a value-mode entry on the 0-3 scale. Without goals any entry is
 * level 1 (the original behavior). With goals the number climbs the same
 * ladder as steps: level = how many goals it reaches, so an entry below
 * goal 1 (or non-numeric text, which can't reach a number) is level 0.
 */
export function valueLevel(v: unknown, goals: number[] | undefined): number {
  if (!isValueRecorded(v)) return 0;
  if (!goals || goals.length === 0) return 1;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n)) return 0;
  let level = 0;
  for (const goal of goals) {
    if (n >= goal) level++;
    else break;
  }
  return Math.min(3, level);
}

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
    case 'phoneFree':
    case 'quad':
      return v === 'ideal' ? 3 : v === 'goal' ? 2 : v === 'yes' ? 1 : 0;
    case 'counter':
      return (v as number) > 0 ? 1 : 0;
    case 'value':
      return valueLevel(v, valueGoalsOn(habit, record.date));
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
