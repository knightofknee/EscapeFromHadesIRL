import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted state for an in-flight meditation timer — one slot per habit so
 * concurrent timers on different habits are possible. Lives in AsyncStorage
 * so that a paused (or running) timer survives an app close.
 *
 * Day-cross semantics: `date` is the YYYY-MM-DD of the **start** day. If a
 * timer started at 11:50pm and completes after midnight, the resulting
 * session is logged to `date`, not "today" at completion time. Modal load
 * also discards any persisted state from a prior local day so users start
 * each day with a fresh timer (matches the user's stated rule:
 * "if it is a new day, the user should start the day fresh").
 */
export type PersistedTimerState = {
  habitId: string;
  /** YYYY-MM-DD of the start day (matches the record's date). */
  date: string;
  /** Total configured run length in seconds (lets Reset return to this). */
  totalSec: number;
  /**
   * When the timer is RUNNING: ms timestamp of the most-recent (re)start.
   * When PAUSED or never started: null.
   */
  startedAt: number | null;
  /**
   * Seconds remaining at `startedAt` (or the paused value when paused).
   * Combined with `startedAt` lets us derive the current remaining at any
   * later moment without drift.
   */
  remainingAtStart: number;
  /** id of the scheduled completion notification, if any. */
  notificationId: string | null;
};

const KEY_PREFIX = 'meditation:timer:v1:';

function key(habitId: string): string {
  return `${KEY_PREFIX}${habitId}`;
}

export async function loadTimerState(habitId: string): Promise<PersistedTimerState | null> {
  try {
    const raw = await AsyncStorage.getItem(key(habitId));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedTimerState;
  } catch (e) {
    console.error('loadTimerState failed:', e);
    return null;
  }
}

export async function saveTimerState(state: PersistedTimerState): Promise<void> {
  try {
    await AsyncStorage.setItem(key(state.habitId), JSON.stringify(state));
  } catch (e) {
    console.error('saveTimerState failed:', e);
  }
}

export async function clearTimerState(habitId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(habitId));
  } catch (e) {
    console.error('clearTimerState failed:', e);
  }
}

/**
 * Compute the remaining seconds for the given persisted state at `now` (ms).
 * Paused → returns the stored `remainingAtStart`. Running → derives by
 * subtracting elapsed time; clamps at 0.
 */
export function computeRemainingSec(state: PersistedTimerState, now: number): number {
  if (state.startedAt == null) return state.remainingAtStart;
  const elapsed = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  return Math.max(0, state.remainingAtStart - elapsed);
}

/** True iff the persisted state is for a previous local day. */
export function isStaleForDay(state: PersistedTimerState, todayStr: string): boolean {
  return state.date < todayStr;
}
