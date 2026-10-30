import { isValueRecorded, recordLevel, shouldSkipWeekend, valueGoalsOn } from '@/lib/habit-scoring';
import type { Habit, HabitRecord } from '@/types/habit';

/**
 * What fuels one heatmap day on the Month view: each habit's tier that day
 * and the weighted score behind the cell's shade. Single source for the
 * calendar colour AND the tap-to-see-why popover, so they can't disagree.
 *
 * Weights: done = 1.0, goal/double = 1.25, ideal = 1.5; the shade is
 * score / (active habits × 1.5). Vacation days aren't part of the heatmap
 * (callers skip them). With "Win only Weekends", a weekend habit that
 * wasn't done leaves the day entirely — it's listed as `weekendOff` so the
 * popover can say why it doesn't count.
 */
export const TIER_WEIGHTS = [0, 1, 1.25, 1.5] as const;
export const MAX_TIER_WEIGHT = 1.5;

export const TIER_LABELS = ['missed', 'done', 'goal', 'ideal'] as const;

export type DayHabitRow = {
  habit: Habit;
  /** 0 missed, 1 done, 2 goal, 3 ideal — the unified scale. */
  level: number;
  /** What to print for the row: the tier, or the raw amount for value/steps/counter habits. */
  detail: string;
  /** Excluded from the day's score by Win-only Weekends. */
  weekendOff: boolean;
};

export type DayBreakdown = {
  rows: DayHabitRow[];
  /** Weighted score over the habits that count; 0..1 (the heatmap ratio). */
  ratio: number;
  /** Habits that count today and how many of them were done at all. */
  active: number;
  done: number;
};

function rowDetail(habit: Habit, record: HabitRecord | undefined, level: number): string {
  // A value habit with goals can hold an amount short of goal 1: show it.
  if (level === 0 && habit.recordingMode === 'value' && isValueRecorded(record?.value)) {
    return String(record?.value).trim();
  }
  if (level === 0) return TIER_LABELS[0];
  switch (habit.recordingMode) {
    case 'value': {
      const amount = String(record?.value ?? '').trim() || TIER_LABELS[1];
      return valueGoalsOn(habit, record?.date).length ? `${amount} · ${TIER_LABELS[level]}` : amount;
    }
    case 'counter':
      return `${record?.value ?? 0}`;
    case 'steps':
      return typeof record?.steps === 'number'
        ? `${record.steps.toLocaleString()} · ${TIER_LABELS[level]}`
        : TIER_LABELS[level];
    default:
      return TIER_LABELS[level];
  }
}

export function computeDayBreakdown(
  habits: Habit[],
  dateStr: string,
  recordFor: (habit: Habit) => HabitRecord | undefined,
  winOnlyWeekends: boolean,
): DayBreakdown {
  const rows: DayHabitRow[] = [];
  let score = 0;
  let active = 0;
  let done = 0;
  for (const habit of habits) {
    const record = recordFor(habit);
    const weekendOff = shouldSkipWeekend(habit, record, dateStr, winOnlyWeekends);
    const level = Math.min(3, recordLevel(habit, record));
    rows.push({ habit, level, detail: rowDetail(habit, record, level), weekendOff });
    if (weekendOff) continue;
    active++;
    if (level > 0) done++;
    score += TIER_WEIGHTS[level];
  }
  const denominator = active * MAX_TIER_WEIGHT;
  return { rows, ratio: denominator > 0 ? score / denominator : 0, active, done };
}

/** A heatmap cell's color: unrecorded at 0, else the recorded color with alpha 0x30 (barely) to 0xFF (perfect). */
export function heatmapShade(ratio: number, recorded: string, unrecorded: string): string {
  if (ratio === 0) return unrecorded;
  const opacity = Math.round(0x30 + (0xff - 0x30) * Math.min(ratio, 1));
  return `${recorded}${opacity.toString(16).padStart(2, '0').toUpperCase()}`;
}
