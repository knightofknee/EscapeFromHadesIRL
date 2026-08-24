import { db, doc, getDoc } from '@/lib/firebase/firestore';
import { computeMeditationTier } from '@/lib/meditation';
import { cancelMeditationAlarm } from '@/lib/meditation-notifications';
import {
  clearTimerState,
  loadTimerState,
  type PersistedTimerState,
} from '@/lib/meditation-timer-storage';
import { persistHabitRecord } from '@/lib/persist-record';
import { endActivity } from '@/modules/meditation-activity';
import type { Habit, HabitRecord, MeditationSession } from '@/types/habit';

/**
 * Settlement of finished meditation timers. The app-wide watcher
 * (components/habits/meditation-alarm-watcher.tsx) is the ONLY writer of
 * timer-completed sessions — the modal just notices a run ending, shows it,
 * and calls requestMeditationSweep(). See the watcher's doc for why.
 *
 * Idempotency has two layers:
 *  - `startedAt` stored on each timer session is the run's durable identity;
 *    settle reads the day's record first and skips a run already present, so
 *    retries and racing sweeps can never double-log.
 *  - `claimed` is the in-memory fast path serializing overlapping sweeps in
 *    one process; a claim is RELEASED if the settle fails so a later sweep
 *    can retry.
 */
const claimed = new Set<string>();

function runKey(habitId: string, startedAt: number): string {
  return `${habitId}:${startedAt}`;
}

/** Drop every claim. Called on sign-out so nothing carries into a new account. */
export function releaseCompletionClaims(): void {
  claimed.clear();
}

/**
 * Build the day's meditation record from a full session list. The single
 * record constructor — the watcher's settle, the modal's Log Session, and
 * the modal's Remove all write through this so the doc id scheme, tier
 * computation, and shape can never drift apart.
 */
export function buildMeditationRecord(
  habit: Habit,
  userId: string,
  date: string,
  sessions: MeditationSession[],
): HabitRecord {
  return {
    id: `${habit.id}_${date}`,
    habitId: habit.id,
    userId,
    date,
    value: computeMeditationTier(
      sessions,
      habit.meditationSessions ?? 1,
      habit.meditationMinutes ?? 5,
      habit.meditationIdealTotalMinutes,
    ),
    recordedAt: Date.now(),
    sessions,
  };
}

/**
 * Log a finished run as a session and tear down everything it left behind.
 *
 * Reads the day's record STRAIGHT from Firestore rather than trusting any
 * listener state: the records listener's loadedRange is also set on its
 * error path and by an offline empty-cache snapshot, and a write built on
 * that emptiness would replace the record and erase sessions logged earlier
 * in the day. getDoc either returns the truth or fails — and on failure
 * (offline, no cache) we leave the slot on disk, release the claim, and let
 * a later sweep retry. Sessions are attributed to the run's START day
 * (`state.date`), so a timer begun at 11:50pm counts for the day the user
 * sat down.
 *
 * Returns true when the run is fully settled (logged now, or found already
 * logged); false when it should be retried later.
 */
export async function settleCompletedTimer(
  state: PersistedTimerState,
  habit: Habit,
  userId: string,
): Promise<boolean> {
  const startedAt = state.startedAt;
  if (startedAt == null) {
    await discardTimer(state);
    return true;
  }

  const key = runKey(state.habitId, startedAt);
  if (claimed.has(key)) return true; // another sweep in this process has it
  claimed.add(key);

  try {
    let existing: MeditationSession[] = [];
    try {
      const snap = await getDoc(doc(db, 'records', `${habit.id}_${state.date}`));
      existing = (snap.data()?.sessions as MeditationSession[] | undefined) ?? [];
    } catch (e) {
      // Offline with nothing cached, or a transient failure — retry later.
      console.warn('settleCompletedTimer: record read failed, deferring:', e);
      claimed.delete(key);
      return false;
    }

    if (!existing.some((s) => s.startedAt === startedAt)) {
      const session: MeditationSession = {
        durationSec: state.totalSec,
        source: 'timer',
        loggedAt: Date.now(),
        startedAt,
      };
      const ok = await persistHabitRecord(
        buildMeditationRecord(habit, userId, state.date, [...existing, session]),
        { errorMessage: "Couldn't save your meditation session. Tap Retry." },
      );
      if (!ok) {
        // Keep the slot and free the claim so the next sweep tries again.
        // (The toast's Retry may also land the write — the startedAt dedup
        // above makes that convergence safe.)
        claimed.delete(key);
        return false;
      }
    }

    await discardTimer(state);
    return true;
  } catch (e) {
    console.error('settleCompletedTimer failed:', e);
    claimed.delete(key);
    return false;
  }
}

/**
 * Tear down a timer's side effects and forget it, without logging anything.
 * Used after a successful settle, for a paused slot left over from a previous
 * day, and for a slot whose habit no longer exists.
 *
 * The persisted slot is removed only if it still holds THIS run — between a
 * sweep finding a finished run and settling it, the user can start a fresh
 * run for the same habit, and unconditionally clearing by habitId would
 * delete the new run's persistence out from under it.
 */
export async function discardTimer(state: PersistedTimerState): Promise<void> {
  await cancelMeditationAlarm(state.notificationId);
  await endActivity(state.activityId);
  const current = await loadTimerState(state.habitId);
  if (current && current.startedAt === state.startedAt && current.date === state.date) {
    await clearTimerState(state.habitId);
  }
}

/**
 * A nudge to the app-wide watcher: "there's a finished timer on disk, settle
 * it now." The watcher normally sweeps when the app foregrounds, which misses
 * a timer that ends while the app is open but its sheet is closed — no
 * foreground transition ever happens. The modal fires this when it sees a run
 * end, and the watcher itself fires it on a timeout armed for the next known
 * end time. Multi-subscriber Set (same pattern as lib/error-bus) so a
 * fast-refresh double mount or a future second observer can't silently steal
 * the slot.
 */
const sweepListeners = new Set<() => void>();

export function onMeditationSweepRequested(listener: () => void): () => void {
  sweepListeners.add(listener);
  return () => {
    sweepListeners.delete(listener);
  };
}

export function requestMeditationSweep(): void {
  for (const listener of [...sweepListeners]) listener();
}
