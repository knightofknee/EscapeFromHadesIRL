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

export function quadForStepsLevel(level: number): QuadValue {
  return STEPS_TIER[Math.max(0, Math.min(3, level))] ?? 'no';
}

export function levelForStepsQuad(value: unknown): number {
  const i = STEPS_TIER.indexOf(value as QuadValue);
  return i < 0 ? 0 : i;
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
