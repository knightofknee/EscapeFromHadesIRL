import { formatDate } from '@/lib/date-utils';
import type { Habit, HabitRecord } from '@/types/habit';
import type { CompletionChecker } from '@/lib/habit-scoring';

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
 * what they care about (stats screen loads from 2000-01-01).
 */
export function computeStreak(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  checker: CompletionChecker,
  vacationSet: Set<string>,
  options?: { now?: Date; safetyCap?: number },
): { current: number; longest: number } {
  const now = options?.now ?? new Date();
  // Hard ceiling to avoid pathological infinite loops if dates ever go
  // sideways. 100 years ≈ 36500 iterations of Map.get — microseconds.
  const safetyCap = options?.safetyCap ?? 365 * 100;

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
  // Vacation today = "skipped". Streak preserved from yesterday but not
  // incremented. Same effect on the math as todayCompleted being false.
  const todayCompleted = todayIsVacation ? false : checker(habit, todayRecord);

  const checkDate = new Date(now);
  checkDate.setDate(checkDate.getDate() - 1);

  for (let i = 0; i < safetyCap; i++) {
    const dateStr = formatDate(checkDate);

    // Stop once we've gone past the earliest record for this habit —
    // every day before that is necessarily "not completed" and would
    // just keep resetting the streak to 0 without finding new data.
    if (earliestForHabit !== null && dateStr < earliestForHabit) break;
    if (earliestForHabit === null) break;

    if (!vacationSet.has(dateStr)) {
      const record = recordIndex.get(`${habit.id}_${dateStr}`);
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

  return { current, longest };
}
