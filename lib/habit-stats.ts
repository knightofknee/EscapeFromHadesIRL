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

/**
 * Value habits are charted by their numeric trend (average per day), not by
 * completion rate — the user enters an amount each day (e.g. hours coded)
 * and cares how much, not whether. Streaks keep the traditional "any entry
 * counts" reading; the rate cards and monthly chart switch to averages.
 */
export function isValueTrendHabit(habit: Habit): boolean {
  return habit.recordingMode === 'value';
}

/** Numeric reading of a value-mode record: the parsed number, or 0 when the
 * record is missing, blank, or non-numeric text (which still counts as done
 * for streaks but contributes nothing to the trend). */
export function recordNumericValue(record?: HabitRecord): number {
  if (!record) return 0;
  const n = Number(String(record.value).trim());
  return Number.isFinite(n) ? n : 0;
}

/** Display formatting for averaged values: whole numbers once large, one
 * decimal below that (2.5, 8, 0.3 — never 2.50). */
export function formatStatValue(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 100) return String(Math.round(n));
  return String(Math.round(n * 10) / 10);
}

/** One month of the statistics chart: the month's own value (rate or
 * avg/day), the live-since-started rolling average, and the full-window one. */
export type MonthlyPoint = {
  date: string;
  value: number;
  avg: number;
  avgFull: number;
  /** Months of history the habit has through this month (0 before it started). */
  months: number;
};

/**
 * Rolling average over a habit's monthly series, windowed to the last
 * `displayMonths` of `series` (oldest first). The average is "live since you
 * started": months before the habit's first non-zero month — inside or
 * outside the display window — are not part of its history and are left
 * out (a habit started 6 months into an 18-month window otherwise read 0.4
 * against real months of ~1.2). From the first active month on, every
 * month counts, zeros included: a blank month after starting is a real
 * drop. `round` shapes the reported average (percent habits round to whole
 * numbers).
 *
 * `avgFull` is the unfiltered companion: the same rolling average with every
 * displayed month counted, zeros before the start included. The chart draws
 * it as a second, unlabeled line — the "high score" reading, which maxes out
 * only once the whole window has history.
 */
function rollingMonthlyAverage(
  series: { date: string; value: number }[],
  displayMonths: number,
  round: (avg: number) => number = (n) => n,
): MonthlyPoint[] {
  const startIdx = Math.max(0, series.length - displayMonths);
  let sum = 0;
  let count = 0;
  for (let j = 0; j < startIdx; j++) {
    if (series[j].value > 0) {
      sum += series[j].value;
      count++;
    }
  }

  const result: MonthlyPoint[] = [];
  let started = count > 0;
  let fullSum = sum;
  let fullCount = count;
  for (let i = startIdx; i < series.length; i++) {
    const { date, value } = series[i];
    fullSum += value;
    fullCount++;
    const avgFull = round(fullSum / fullCount);
    if (!started && value === 0) {
      result.push({ date, value: 0, avg: 0, avgFull, months: 0 });
      continue;
    }
    started = true;
    sum += value;
    count++;
    result.push({ date, value, avg: round(sum / count), avgFull, months: count });
  }
  return result;
}

/** Average recorded value per day over the trailing 7/30/90 days. Days with
 * no entry count as 0 — the trend measures output per calendar day, not per
 * active day — while vacation days and win-only-weekend skips are removed
 * from the timeline entirely, matching the completion-rate semantics. */
export function computeValueAverages(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  vacationSet: Set<string>,
  winOnlyWeekends: boolean,
): { week: number; month: number; quarter: number } {
  const now = new Date();
  const averages = { week: 0, month: 0, quarter: 0 };

  for (const [period, days] of [
    ['week', 7],
    ['month', 30],
    ['quarter', 90],
  ] as const) {
    let sum = 0;
    let active = 0;
    for (let d = 1; d <= days; d++) {
      const checkDate = new Date(now);
      checkDate.setDate(now.getDate() - d);
      const dateStr = formatDate(checkDate);
      if (vacationSet.has(dateStr)) continue;
      const record = recordIndex.get(`${habit.id}_${dateStr}`);
      if (shouldSkipWeekend(habit, record, dateStr, winOnlyWeekends)) continue;
      active++;
      sum += recordNumericValue(record);
    }
    averages[period] = active > 0 ? sum / active : 0;
  }

  return averages;
}

/** Monthly average-value-per-day for the last `displayMonths` months, each
 * with the rolling average across all months up to it — the value-habit
 * counterpart of computeMonthlyRates, with identical window, vacation,
 * weekend, and rolling-average (see rollingMonthlyAverage) semantics. */
export function computeMonthlyValueAverages(
  habit: Habit,
  recordIndex: Map<string, HabitRecord>,
  displayMonths: number,
  vacationSet: Set<string>,
  winOnlyWeekends: boolean,
): MonthlyPoint[] {
  const now = new Date();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  const totalMonths = 36;
  const allAverages: { date: string; value: number }[] = [];

  for (let m = totalMonths - 1; m >= 0; m--) {
    const monthDate = new Date(todayYear, todayMonth - m, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const isCurrentMonth = year === todayYear && month === todayMonth;
    const countDays = isCurrentMonth ? Math.max(1, todayDate - 1) : daysInMonth;

    let sum = 0;
    let activeDays = 0;
    for (let d = 1; d <= countDays; d++) {
      const dateStr = formatDate(new Date(year, month, d));
      if (vacationSet.has(dateStr)) continue;
      const record = recordIndex.get(`${habit.id}_${dateStr}`);
      if (shouldSkipWeekend(habit, record, dateStr, winOnlyWeekends)) continue;
      activeDays++;
      sum += recordNumericValue(record);
    }

    const average = activeDays > 0 ? sum / activeDays : 0;
    const label = `${year}-${String(month + 1).padStart(2, '0')}`;
    allAverages.push({ date: label, value: average });
  }

  return rollingMonthlyAverage(allAverages, displayMonths);
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
): MonthlyPoint[] {
  const now = new Date();
  const todayDate = now.getDate();
  const todayMonth = now.getMonth();
  const todayYear = now.getFullYear();

  // Compute 36 months of raw rates for rolling average calculation
  const totalMonths = 36;
  const allRates: { date: string; value: number }[] = [];

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
    allRates.push({ date: label, value: rate });
  }

  // Last displayMonths with the "live since you started" rolling average.
  return rollingMonthlyAverage(allRates, displayMonths, Math.round);
}
