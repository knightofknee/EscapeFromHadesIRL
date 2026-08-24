import type { MeditationSession, QuadValue } from '@/types/habit';

/** Minutes a single session must last to count as one "long" session for the ideal tier. */
const IDEAL_SESSION_MIN_MINUTES = 15;
/** How many "long" sessions in a day earn the ideal tier (independent of the habit's config). */
const IDEAL_SESSION_MIN_COUNT = 2;

const IDEAL_DURATION_SEC = IDEAL_SESSION_MIN_MINUTES * 60;

/**
 * Compute today's meditation tier from the day's session list and the habit's
 * configured target.
 *
 * - 0 sessions → `'no'`
 * - At least one session of any length → `'yes'`
 * - At least `targetSessions` sessions of `>= targetMinutes` each → `'goal'`
 * - `'ideal'` (star):
 *     • if `idealTotalMinutes` is set → the day's TOTAL minutes (every session
 *       summed) reach that threshold;
 *     • otherwise (legacy habits with no configured total) → the gold-standard
 *       fallback of `IDEAL_SESSION_MIN_COUNT` sessions of
 *       `>= IDEAL_SESSION_MIN_MINUTES` each.
 *
 * Ideal is an INDEPENDENT rule (not "goal plus more"): a user can hit ideal
 * even if their per-session `goal` wasn't met. That's intentional — ideal is
 * the gold-standard day, not a multiple of the user's own target.
 */
export function computeMeditationTier(
  sessions: MeditationSession[] | undefined,
  targetSessions: number,
  targetMinutes: number,
  idealTotalMinutes?: number,
): QuadValue {
  if (!sessions || sessions.length === 0) return 'no';

  // Ideal first — overrides goal if both happen to be met (or only ideal).
  if (idealTotalMinutes && idealTotalMinutes > 0) {
    const totalMinutes = sessions.reduce((sum, s) => sum + s.durationSec, 0) / 60;
    if (totalMinutes >= idealTotalMinutes) return 'ideal';
  } else {
    const longSessions = sessions.filter((s) => s.durationSec >= IDEAL_DURATION_SEC).length;
    if (longSessions >= IDEAL_SESSION_MIN_COUNT) return 'ideal';
  }

  const targetDurationSec = targetMinutes * 60;
  const qualifying = sessions.filter((s) => s.durationSec >= targetDurationSec).length;
  if (qualifying >= targetSessions) return 'goal';

  return 'yes';
}

/**
 * Count of sessions on a day that are at least `targetMinutes` long. Used
 * for the tile subtitle "qualifying/target".
 */
export function getMeditationQualifyingCount(
  sessions: MeditationSession[] | undefined,
  targetMinutes: number,
): number {
  if (!sessions || sessions.length === 0) return 0;
  const targetDurationSec = targetMinutes * 60;
  return sessions.filter((s) => s.durationSec >= targetDurationSec).length;
}

/** Format mm:ss for a number of seconds, e.g. 65 → "1:05", 3725 → "62:05". */
export function formatTimerDuration(totalSec: number): string {
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * How far past its end time a completion can be noticed and still count as
 * one the user watched happen.
 */
export const LIVE_COMPLETION_GRACE_MS = 3000;

/**
 * Should a finished timer ring the in-app alarm, or just report itself?
 *
 * A suspended app freezes its JS timers, so the countdown only catches up
 * when the app comes back — at which point it discovers a run that ended
 * minutes or hours ago. Ringing then means the app starts an alarm *because*
 * you opened it, and the notification already did the alerting anyway. So the
 * bell is reserved for a completion that lands while the user is actually
 * looking at it.
 *
 * @param endedAtMs when the run was due to finish
 * @param nowMs when the completion was noticed
 * @param appActive whether the app is in the foreground right now
 */
export function shouldRingInApp(endedAtMs: number, nowMs: number, appActive: boolean): boolean {
  return appActive && nowMs - endedAtMs < LIVE_COMPLETION_GRACE_MS;
}
