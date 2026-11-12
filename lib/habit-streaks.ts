import { formatDate } from '@/lib/date-utils';
import type { Habit, HabitRecord } from '@/types/habit';
import { shouldSkipWeekend, type CompletionChecker } from '@/lib/habit-scoring';

/**
 * Compute current and longest streaks for a habit, treating vacation
 * days as removed from the timeline (they don't increment the streak,
 * but they don't break it either).
 *
 * No fixed iteration cap — scans backward until we've covered every
 * loaded record for the habit. If `recordIndex` doesn't contain a record
 * for the habit at all, returns zero streaks instantly.
 *
 * Caller is responsible for loading enough records for the scan to find
 * what they care about. Pass `scanUntil` (the first day of the loaded
 * window) and the result says whether the longest streak was still alive at
 * that day (`longestOpen`): the caller then loads further back and
 * recomputes, so a streak older than the window is never reported as the
 * window's length.
 */
export function computeStreak(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  checker: CompletionChecker,
  vacationSet: Set<string>,
  options?: { now?: Date; safetyCap?: number; winOnlyWeekends?: boolean; scanUntil?: string },
): { current: number; longest: number; longestOpen: boolean } {
  const now = options?.now ?? new Date();
  // Hard ceiling to avoid pathological infinite loops if dates ever go
  // sideways. 100 years ≈ 36500 iterations of Map.get — microseconds.
  const safetyCap = options?.safetyCap ?? 365 * 100;
  const winOnlyWeekends = options?.winOnlyWeekends ?? false;
  const scanUntil = options?.scanUntil;

  // Find the earliest record date for this habit. If none, no streak.
  let earliestForHabit: string | null = null;
  for (const record of recordIndex.values()) {
    if (record.habitId !== habit.id) continue;
    if (earliestForHabit === null || record.date < earliestForHabit) {
      earliestForHabit = record.date;
    }
  }

  let current = 0;
  let longest = 0;
  let streak = 0;
  let isCurrent = true;

  const todayStr = formatDate(now);
  const todayIsVacation = vacationSet.has(todayStr);
  const todayRecord = recordIndex.get(`${habit.id}_${todayStr}`);
  const todaySkippedForWeekend = shouldSkipWeekend(
    habit,
    todayRecord,
    todayStr,
    winOnlyWeekends,
    checker,
  );
  // Vacation today OR weekend-skipped today = "skipped". Streak preserved
  // from yesterday but not incremented. Same effect on the math as
  // todayCompleted being false.
  const todayCompleted =
    todayIsVacation || todaySkippedForWeekend ? false : checker(habit, todayRecord);

  const checkDate = new Date(now);
  checkDate.setDate(checkDate.getDate() - 1);

  // Set when the scan ran off the loaded window's first day (scanUntil)
  // rather than running out of records.
  let hitWindowStart = false;

  for (let i = 0; i < safetyCap; i++) {
    const dateStr = formatDate(checkDate);

    if (earliestForHabit === null) break;
    if (scanUntil !== undefined && dateStr < scanUntil) {
      hitWindowStart = true;
      break;
    }
    // Stop once we've gone past the earliest record for this habit —
    // every day before that is necessarily "not completed" and would
    // just keep resetting the streak to 0 without finding new data. With a
    // window edge to report, keep going only while a run is still alive
    // (the next unskipped day closes it), so a run that reaches the edge
    // is reported as open.
    if (dateStr < earliestForHabit && (scanUntil === undefined || streak === 0)) break;

    const record = recordIndex.get(`${habit.id}_${dateStr}`);
    const skipped =
      vacationSet.has(dateStr) ||
      shouldSkipWeekend(habit, record, dateStr, winOnlyWeekends, checker);

    if (!skipped) {
      const completed = checker(habit, record);

      if (completed) {
        streak++;
        if (isCurrent) current = streak;
      } else {
        if (isCurrent) isCurrent = false;
        longest = Math.max(longest, streak);
        streak = 0;
      }
    }

    checkDate.setDate(checkDate.getDate() - 1);
  }
  longest = Math.max(longest, streak);

  if (todayCompleted) current++;
  longest = Math.max(longest, current);

  // The run alive at the window's first day is the current run when nothing
  // broke it on the way back, else the oldest run scanned.
  const trailingRun = isCurrent ? current : streak;
  const longestOpen = hitWindowStart && trailingRun > 0 && trailingRun === longest;

  return { current, longest, longestOpen };
}
