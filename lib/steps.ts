import { addDays, formatDate } from '@/lib/date-utils';
import type { QuadValue } from '@/types/habit';

/**
 * A steps habit's achieved tier is stored on the record as a `QuadValue` so
 * it reuses the quad tile visuals and scoring (Level 1/2/3 → yes/goal/ideal).
 *
 * Index N in this array == "level N reached":
 *   0 → 'no'   (below Level 1)
 *   1 → 'yes'  (Level 1)
 *   2 → 'goal' (Level 2)
 *   3 → 'ideal' (Level 3)
 */
const STEPS_TIER: QuadValue[] = ['no', 'yes', 'goal', 'ideal'];

function quadForStepsLevel(level: number): QuadValue {
  return STEPS_TIER[Math.max(0, Math.min(3, level))] ?? 'no';
}

export function levelForStepsQuad(value: unknown): number {
  const i = STEPS_TIER.indexOf(value as QuadValue);
  return i < 0 ? 0 : i;
}

/**
 * How far back the backfill scans when a habit has no
 * `stepsConfirmedThrough` yet (predates the field): the one-time
 * initialization window.
 */
export const STEPS_CONFIRM_INITIAL_DAYS = 30;

/**
 * How far back the backfill catches up when a habit HAS a pointer but the
 * app wasn't opened for a long stretch. Days older than this keep whatever
 * record they had; bounding the walk keeps a long-dormant relaunch from
 * issuing months of health queries.
 */
export const STEPS_CONFIRM_CATCHUP_DAYS = 60;

/**
 * The ended local days whose final step counts still need to be written —
 * every day after `confirmedThrough` up through yesterday. Today is never
 * included: it hasn't ended, so its count can't be final.
 *
 * Without a pointer the window opens STEPS_CONFIRM_INITIAL_DAYS back; with
 * one it's capped at STEPS_CONFIRM_CATCHUP_DAYS. Both are floored at the
 * habit's creation day.
 */
export function unconfirmedStepDays(
  confirmedThrough: string | undefined,
  todayStr: string,
  createdAt: number,
): string[] {
  const yesterday = addDays(todayStr, -1);
  let start: string;
  if (confirmedThrough) {
    start = addDays(confirmedThrough, 1);
    const floor = addDays(todayStr, -STEPS_CONFIRM_CATCHUP_DAYS);
    if (start < floor) start = floor;
  } else {
    start = addDays(todayStr, -STEPS_CONFIRM_INITIAL_DAYS);
  }
  const createdDay = formatDate(new Date(createdAt));
  if (start < createdDay) start = createdDay;

  const days: string[] = [];
  for (let d = start; d <= yesterday; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * Derive the achieved tier from a raw step count and the habit's ascending
 * goal thresholds. Returns 'no' when steps is missing or below Level 1.
 *
 * Used by the steps tile modal (HealthKit fetch path) and any future
 * background sync.
 */
export function computeStepsLevel(steps: number | undefined, goals: number[]): QuadValue {
  if (!steps || goals.length === 0) return 'no';
  let level = 0;
  for (let i = 0; i < goals.length; i++) {
    if (steps >= goals[i]) level = i + 1;
    else break;
  }
  return quadForStepsLevel(level);
}
