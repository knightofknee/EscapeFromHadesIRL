import { addDays, formatDate, parseDate } from '@/lib/date-utils';
import { isRecordCompleted, recordLevel, shouldSkipWeekend } from '@/lib/habit-scoring';
import { formatStatValue, recordNumericValue } from '@/lib/habit-stats';
import type { Habit, HabitRecord } from '@/types/habit';

/**
 * Per-habit numbers for one month on the Month view: completion rate, the
 * amount trio (total / average / median) for habits that record an amount,
 * and the day-by-day series behind the row's sparkline.
 *
 * Amount semantics match the Stats screen's value trend: every counted day
 * is in the denominator and a blank day is 0 (output per calendar day, not
 * per logged day). Vacation and win-only-weekend days are passed in as
 * excluded and leave the month entirely, same as the completion rate.
 */

export type MonthAmountKind = 'value' | 'steps' | 'minutes';

export type MonthAmount = {
  kind: MonthAmountKind;
  total: number;
  /** Per counted day; null when no day counts yet (e.g. the 1st). */
  average: number | null;
  median: number | null;
  /** Meditation reports only total + average (median isn't asked for there). */
  showMedian: boolean;
};

export type MonthDayInput = {
  day: number;
  record?: HabitRecord;
  /** Vacation day or a win-only-weekend skip: not part of the month. */
  excluded: boolean;
};

export type MonthHabitStats = {
  completed: number;
  activeDays: number;
  /** Whole-number percent; null when no day counts yet. */
  rate: number | null;
  amount: MonthAmount | null;
  /** Counted days only, oldest first. y is an amount or a 0-3 tier. */
  series: { day: number; y: number }[];
  /** Top of the sparkline's y range (>= every y; 0 only for an all-zero amount month). */
  yMax: number;
};

export function meditationMinutes(record?: HabitRecord): number {
  if (!record?.sessions?.length) return 0;
  return record.sessions.reduce((sum, s) => sum + s.durationSec, 0) / 60;
}

function amountKind(habit: Habit): MonthAmountKind | null {
  switch (habit.recordingMode) {
    case 'value':
      return 'value';
    case 'steps':
      return 'steps';
    case 'meditation':
      return 'minutes';
    default:
      return null;
  }
}

function dayAmount(kind: MonthAmountKind, record?: HabitRecord): number {
  if (kind === 'value') return recordNumericValue(record);
  if (kind === 'steps') return record?.steps ?? 0;
  return meditationMinutes(record);
}

/** Highest tier a mode can reach — the sparkline's ceiling for tier habits. */
function maxLevel(habit: Habit): number {
  switch (habit.recordingMode) {
    case 'boolean':
    case 'counter':
      return 1;
    case 'triple':
      return 2;
    default:
      return 3;
  }
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeMonthHabitStats(habit: Habit, days: MonthDayInput[]): MonthHabitStats {
  const kind = amountKind(habit);
  let completed = 0;
  const amounts: number[] = [];
  const series: { day: number; y: number }[] = [];

  for (const { day, record, excluded } of days) {
    if (excluded) continue;
    if (isRecordCompleted(habit, record)) completed++;
    if (kind) {
      const a = dayAmount(kind, record);
      amounts.push(a);
      series.push({ day, y: a });
    } else if (habit.recordingMode === 'counter') {
      series.push({ day, y: typeof record?.value === 'number' ? record.value : 0 });
    } else {
      series.push({ day, y: recordLevel(habit, record) });
    }
  }

  const activeDays = series.length;
  const rate = activeDays > 0 ? Math.round((completed / activeDays) * 100) : null;

  let amount: MonthAmount | null = null;
  if (kind) {
    const total = amounts.reduce((a, b) => a + b, 0);
    amount = {
      kind,
      total,
      average: activeDays > 0 ? total / activeDays : null,
      median: median(amounts),
      showMedian: kind !== 'minutes',
    };
  }

  const dataMax = series.reduce((m, p) => Math.max(m, p.y), 0);
  // Tier habits share a fixed ceiling so a perfect month reads full-height;
  // amounts (and counters) scale to the month's own best day.
  const yMax =
    kind || habit.recordingMode === 'counter' ? dataMax : maxLevel(habit);

  return { completed, activeDays, rate, amount, series, yMax };
}

/** Minutes as "45m" / "3h 20m" / "12h". */
export function formatMinutes(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/** Step counts: full digits under 10k, then "45.2k" / "312k" / "1.2M". */
export function formatSteps(n: number): string {
  const r = Math.round(n);
  if (r < 10_000) return r.toLocaleString();
  if (r < 100_000) return `${(Math.round(r / 100) / 10).toString()}k`;
  if (r < 1_000_000) return `${Math.round(r / 1000)}k`;
  return `${(Math.round(r / 100_000) / 10).toString()}M`;
}

export function formatMonthAmount(amount: MonthAmount, n: number | null): string {
  if (n == null) return '—';
  if (amount.kind === 'minutes') return formatMinutes(n);
  if (amount.kind === 'steps') return formatSteps(n);
  return formatStatValue(n);
}

/**
 * One page of the Month view. Page 0 is the past month ending today (the
 * same date last month, plus a day, through today). Page 1 is the current
 * calendar month so far; negative pages are earlier full calendar months.
 * Nothing lies past page 1, and when the past month already IS the current
 * month (today is the last day of it) page 0 is the last page.
 */
export type MonthPage = {
  kind: 'trailing' | 'calendar';
  /** Inclusive YYYY-MM-DD range on screen. */
  startDate: string;
  endDate: string;
  /** Every date in the range, oldest first. */
  dates: string[];
  /** Dates that count toward the stats: today (still in progress) is left out. */
  countDates: string[];
  label: string;
  /** The calendar month the page belongs to (the share section works in months). */
  year: number;
  month: number;
};

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function datesBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Start of the past month ending on `today`: the same date last month, plus a day (clamped to that month's length). */
export function trailingMonthStart(today: Date): string {
  const y = today.getFullYear();
  const m = today.getMonth();
  const lastMonthDays = new Date(y, m, 0).getDate();
  const sameDay = Math.min(today.getDate(), lastMonthDays);
  return formatDate(new Date(y, m - 1, sameDay + 1));
}

/** The furthest page forward: 1 (the current month) unless the past month already is the current month. */
export function maxMonthPage(today: Date): number {
  return trailingMonthStart(today) === formatDate(new Date(today.getFullYear(), today.getMonth(), 1)) ? 0 : 1;
}

export function monthPage(offset: number, today: Date): MonthPage {
  const todayStr = formatDate(today);
  const yesterday = addDays(todayStr, -1);
  if (offset === 0) {
    const startDate = trailingMonthStart(today);
    const dates = datesBetween(startDate, todayStr);
    const start = parseDate(startDate);
    const sameMonth = start.getMonth() === today.getMonth();
    const label = sameMonth
      ? `${FULL_MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`
      : `${SHORT_MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${SHORT_MONTH_NAMES[today.getMonth()]} ${today.getDate()}`;
    return {
      kind: 'trailing',
      startDate,
      endDate: todayStr,
      dates,
      countDates: dates.filter((d) => d <= yesterday),
      label,
      year: today.getFullYear(),
      month: today.getMonth(),
    };
  }
  // offset 1 is the current month; offsets <= -1 are the months before it.
  const target = new Date(today.getFullYear(), today.getMonth() + (offset > 0 ? 0 : offset), 1);
  const y = target.getFullYear();
  const m = target.getMonth();
  const startDate = formatDate(target);
  const endDate = formatDate(new Date(y, m + 1, 0));
  const dates = datesBetween(startDate, endDate);
  return {
    kind: 'calendar',
    startDate,
    endDate,
    dates,
    countDates: dates.filter((d) => d <= yesterday),
    label: `${FULL_MONTH_NAMES[m]} ${y}`,
    year: y,
    month: m,
  };
}

/** Monday-first calendar grid over any run of dates: one array per week, null where the range hasn't started or has ended. */
export function rangeCalendarWeeks(dates: string[]): (string | null)[][] {
  if (dates.length === 0) return [];
  const firstDayOfWeek = (parseDate(dates[0]).getDay() + 6) % 7; // Monday=0
  const weeks: (string | null)[][] = [];
  let currentWeek: (string | null)[] = new Array(firstDayOfWeek).fill(null);
  for (const d of dates) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }
  return weeks;
}

/** Monday-first calendar grid: one array per week, null where the month hasn't started or has ended. */
export function monthCalendarWeeks(year: number, month: number): (number | null)[][] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => formatDate(new Date(year, month, i + 1)));
  return rangeCalendarWeeks(dates).map((week) => week.map((d) => (d ? parseDate(d).getDate() : null)));
}

/**
 * How many days of the month count. The current month only counts up to
 * yesterday (today is still in progress); on the 1st that's 0, which shows
 * as "—" rather than a false 0%.
 */
export function monthCountDays(year: number, month: number, today: Date): number {
  if (year === today.getFullYear() && month === today.getMonth()) return today.getDate() - 1;
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Every habit's stats over a run of counted dates (oldest first). Vacation
 * days and weekend non-completions leave the range entirely; with the
 * per-habit weekend-skip rule each habit can have its own denominator.
 * Series days are 1-based positions in `countDates`, so the sparkline's x
 * axis is the range's length.
 */
export function computeRangeRows(
  habits: Habit[],
  recordIndex: Map<string, HabitRecord>,
  countDates: string[],
  vacationSet: Set<string>,
  winOnlyWeekends: boolean,
): ({ habit: Habit } & MonthHabitStats)[] {
  return habits.map((habit) => {
    const days: MonthDayInput[] = countDates.map((dateStr, i) => {
      const record = recordIndex.get(`${habit.id}_${dateStr}`);
      const excluded =
        vacationSet.has(dateStr) || shouldSkipWeekend(habit, record, dateStr, winOnlyWeekends);
      return { day: i + 1, record, excluded };
    });
    return { habit, ...computeMonthHabitStats(habit, days) };
  });
}

/** Every habit's stats for one calendar month (the first `countDays` days of it). */
export function computeMonthRows(
  habits: Habit[],
  recordIndex: Map<string, HabitRecord>,
  year: number,
  month: number,
  countDays: number,
  vacationSet: Set<string>,
  winOnlyWeekends: boolean,
): ({ habit: Habit } & MonthHabitStats)[] {
  const countDates = Array.from({ length: Math.max(0, countDays) }, (_, i) =>
    formatDate(new Date(year, month, i + 1)),
  );
  return computeRangeRows(habits, recordIndex, countDates, vacationSet, winOnlyWeekends);
}
