import { formatDate } from '@/lib/date-utils';
import { shouldSkipWeekend } from '@/lib/habit-scoring';
import type { CompletionChecker } from '@/lib/habit-scoring';
import type { Habit, HabitRecord } from '@/types/habit';

/**
 * Shared stat computations AND chart presentation contract for the Stats
 * screen and the PDF export — one source of truth so the export always
 * matches the screen (numbers, window length, axis labels, line rules).
 */

/** Months shown in the monthly chart (screen and PDF). */
export const STATS_DISPLAY_MONTHS = 18;

/** Single-letter x-axis month labels (screen and PDF). */
export const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/** Whether the rolling-average line renders: any activity in the window —
 * a low average legitimately rounds to 0% and should hug the floor, not
 * vanish; only a habit with no data at all goes lineless. */
export function chartHasActivity(data: { value: number; avg?: number }[]): boolean {
  return data.some((d) => (d.avg != null && d.avg > 0) || d.value > 0);
}

/** How many success-level pages/columns a habit has (1 per reachable tier). */
export function getStatsPageCount(habit: Habit): number {
  if (habit.recordingMode === 'quad') return 3;
  if (habit.recordingMode === 'steps') return Math.min(3, Math.max(1, habit.stepGoals?.length ?? 1));
  // Meditation always has 3 reachable tiers (yes/goal/ideal) since ideal is
  // a universal threshold independent of the user's per-session config.
  if (habit.recordingMode === 'meditation') return 3;
  // Creative Writing reuses the quad tiers; auto-bumps to yes, user taps
  // for goal/ideal.
  if (habit.recordingMode === 'creativeWriting') return 3;
  if (habit.recordingMode === 'triple') return 2;
  return 1;
}

/** Completion rates over the trailing 7/30/90 days. Vacation days and
 * weekend non-completions (with Win-only Weekends) are removed from both
 * numerator and denominator. */
export function computeRates(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  checker: CompletionChecker,
  vacationSet: Set<string>,
  winOnlyWeekends: boolean,
): { week: number; month: number; quarter: number } {
  const now = new Date();
  const rates = { week: 0, month: 0, quarter: 0 };

  for (const [period, days] of [
    ['week', 7],
    ['month', 30],
    ['quarter', 90],
  ] as const) {
    let completed = 0;
    let active = 0;
    for (let d = 1; d <= days; d++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() - d);
      const dateStr = formatDate(checkDate);
      if (vacationSet.has(dateStr)) continue;
      const record = recordIndex.get(`${habit.id}_${dateStr}`);
      if (shouldSkipWeekend(habit, record, dateStr, winOnlyWeekends, checker)) continue;
      active++;
      if (checker(habit, record)) completed++;
    }
    rates[period] = active > 0 ? Math.round((completed / active) * 100) : 0;
  }

  return rates;
}

/** Monthly completion rates for the last `displayMonths` months, each with
 * the rolling average across all months up to it (pre-window months count
 * only when non-zero — skips pre-habit-creation months). */
export function computeMonthlyRates(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  displayMonths: number,
  checker: CompletionChecker,
  vacationSet: Set<string>,
  winOnlyWeekends: boolean,
): { date: string; value: number; avg: number }[] {
  const now = new Date();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  // Compute 36 months of raw rates for rolling average calculation
  const totalMonths = 36;
  const allRates: { date: string; rate: number }[] = [];

  for (let m = totalMonths - 1; m >= 0; m--) {
    const monthDate = new Date(todayYear, todayMonth - m, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const isCurrentMonth = year === todayYear && month === todayMonth;
    const countDays = isCurrentMonth ? Math.max(1, todayDate - 1) : daysInMonth;

    // Both numerator and denominator exclude vacation days and any weekend
    // day that the user didn't complete (when "Win only Weekends" is on) —
    // they're removed from the timeline, "as if they didn't happen".
    let completed = 0;
    let activeDays = 0;
    for (let d = 1; d <= countDays; d++) {
      const dateStr = formatDate(new Date(year, month, d));
      if (vacationSet.has(dateStr)) continue;
      const record = recordIndex.get(`${habit.id}_${dateStr}`);
      if (shouldSkipWeekend(habit, record, dateStr, winOnlyWeekends, checker)) continue;
      activeDays++;
      if (checker(habit, record)) completed++;
    }

    const rate = activeDays > 0 ? Math.round((completed / activeDays) * 100) : 0;
    const label = `${year}-${String(month + 1).padStart(2, '0')}`;
    allRates.push({ date: label, rate });
  }

  // Return last displayMonths with rolling average (average of all months
  // up to and including the current one). Single O(n) forward pass with a
  // running sum.
  //
  // Semantics: months BEFORE the display window only count toward the
  // average if their rate > 0 (skips pre-habit-creation months); every
  // month WITHIN the window counts (even 0%).
  const result: { date: string; value: number; avg: number }[] = [];
  const startIdx = totalMonths - displayMonths;

  let sum = 0;
  let count = 0;
  for (let j = 0; j < startIdx; j++) {
    if (allRates[j].rate > 0) {
      sum += allRates[j].rate;
      count++;
    }
  }

  for (let i = startIdx; i < totalMonths; i++) {
    const { date, rate } = allRates[i];
    sum += rate;
    count++;
    const avg = count > 0 ? Math.round(sum / count) : 0;
    result.push({ date, value: rate, avg });
  }

  return result;
}
