import { isRecordCompleted, recordLevel } from '@/lib/habit-scoring';
import { recordNumericValue } from '@/lib/habit-stats';
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
