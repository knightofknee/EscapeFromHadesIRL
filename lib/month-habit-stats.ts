import { addDays, formatDate, parseDate, type WeekStart } from '@/lib/date-utils';
import { isRecordCompleted, isValueRecorded, recordLevel, shouldSkipWeekend, valueGoalsOn } from '@/lib/habit-scoring';
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
    case 'phoneFree':
      return 'minutes';
    default:
      return null;
  }
}

function dayAmount(habit: Habit, kind: MonthAmountKind, record?: HabitRecord): number {
  if (kind === 'value') return recordNumericValue(record);
  if (kind === 'steps') return record?.steps ?? 0;
  if (habit.recordingMode === 'phoneFree') return (record?.phoneFreeMs ?? 0) / 60000;
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
      const a = dayAmount(habit, kind, record);
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
 * calendar month so far; negative pages are the past months before page 0,
 * lined up with today (see monthPage).
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

/** "Oct 5 – Nov 4", or "November 2026" when the range is exactly one calendar month. */
function rangeLabel(startDate: string, endDate: string): string {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const wholeMonth =
    start.getDate() === 1 &&
    start.getMonth() === end.getMonth() &&
    end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  return wholeMonth
    ? `${FULL_MONTH_NAMES[end.getMonth()]} ${end.getFullYear()}`
    : `${SHORT_MONTH_NAMES[start.getMonth()]} ${start.getDate()} – ${SHORT_MONTH_NAMES[end.getMonth()]} ${end.getDate()}`;
}

/**
 * The page at `offset`. 0 is the past month ending today; each page back
 * is the month before the one after it (Oct 5 – Nov 4, then Sep 5 – Oct 4,
 * then Aug 5 – Sep 4), so the dates keep lining up with today instead of
 * snapping to named months. 1 is the current month so far.
 */
export function monthPage(offset: number, today: Date): MonthPage {
  const todayStr = formatDate(today);
  const yesterday = addDays(todayStr, -1);
  if (offset <= 0) {
    let endDate = todayStr;
    let startDate = trailingMonthStart(today);
    for (let i = 0; i < -offset; i++) {
      endDate = addDays(startDate, -1);
      startDate = trailingMonthStart(parseDate(endDate));
    }
    const dates = datesBetween(startDate, endDate);
    return {
      kind: 'trailing',
      startDate,
      endDate,
      dates,
      countDates: dates.filter((d) => d <= yesterday),
      label: rangeLabel(startDate, endDate),
    };
  }
  // offset 1: the current month so far.
  const y = today.getFullYear();
  const m = today.getMonth();
  const startDate = formatDate(new Date(y, m, 1));
  const endDate = formatDate(new Date(y, m + 1, 0));
  const dates = datesBetween(startDate, endDate);
  return {
    kind: 'calendar',
    startDate,
    endDate,
    dates,
    countDates: dates.filter((d) => d <= yesterday),
    label: `${FULL_MONTH_NAMES[m]} ${y}`,
  };
}

/** The furthest page back: the one holding `firstDate` (the first habit's day), or 0. */
export function minMonthPage(today: Date, firstDate: string | null): number {
  if (!firstDate) return 0;
  let offset = 0;
  // Bounded: a page is about a month, so 600 pages is 50 years.
  while (offset > -600 && monthPage(offset, today).startDate > firstDate) offset--;
  return offset;
}

/** Calendar grid over any run of dates: one array per week starting on `weekStartsOn`, null where the range hasn't started or has ended. */
export function rangeCalendarWeeks(dates: string[], weekStartsOn: WeekStart = 1): (string | null)[][] {
  if (dates.length === 0) return [];
  const firstDayOfWeek = (parseDate(dates[0]).getDay() - weekStartsOn + 7) % 7;
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

/** The pages a share covers, newest first: the page at `offset`, then the `count - 1` pages before it. */
export function reportPages(offset: number, count: number, today: Date): MonthPage[] {
  return Array.from({ length: Math.max(1, count) }, (_, i) => monthPage(offset - i, today));
}

// --- One habit on the calendar (the Month view's habit picker and its PDF) ---

/**
 * A value habit's entry, short enough for a calendar cell: as typed under
 * 10,000 (one decimal at most), then "12.3k" / "312k" / "1.2M". Non-numeric
 * text is cut to 5 characters.
 */
function cellValue(v: unknown): string | null {
  if (!isValueRecorded(v)) return null;
  const raw = String(v).trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw.slice(0, 5);
  const a = Math.abs(n);
  if (a < 10_000) return String(Math.round(n * 10) / 10);
  if (a < 100_000) return `${Math.round(n / 100) / 10}k`;
  if (a < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${Math.round(n / 100_000) / 10}M`;
}

/**
 * The amount a cell shows under its date, or null. The standard (user,
 * 2026-11-12): every habit that records an amount shows it on a one-habit
 * stats calendar. Value entries, counter tallies, step counts, meditation
 * minutes, phone-free time. Never on quest grids.
 */
export function cellAmount(habit: Habit, record: HabitRecord | undefined): string | null {
  switch (habit.recordingMode) {
    case 'value':
      return cellValue(record?.value);
    case 'counter':
      return typeof record?.value === 'number' && record.value > 0 ? cellValue(record.value) : null;
    case 'steps':
      return record?.steps ? formatSteps(record.steps) : null;
    case 'meditation': {
      const min = meditationMinutes(record);
      return min > 0 ? formatMinutes(min) : null;
    }
    case 'phoneFree':
      return record?.phoneFreeMs ? formatMinutes(record.phoneFreeMs / 60000) : null;
    default:
      return null;
  }
}

/** The highest level a habit can reach on `date`: what a full cell means in the one-habit view. */
function topLevel(habit: Habit, date: string): number {
  switch (habit.recordingMode) {
    case 'boolean':
    case 'counter':
      return 1;
    case 'triple':
      return 2;
    case 'value':
      return Math.max(1, Math.min(3, valueGoalsOn(habit, date).length));
    default:
      return 3;
  }
}

/** One habit's shade for a day, 0 to 1: how far it got, out of its top level. A skipped weekend is empty. */
export function focusDayRatio(
  habit: Habit,
  record: HabitRecord | undefined,
  date: string,
  winOnlyWeekends: boolean,
): number {
  if (shouldSkipWeekend(habit, record, date, winOnlyWeekends)) return 0;
  return Math.min(1, recordLevel(habit, record) / topLevel(habit, date));
}
