import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Optional: returns null until the native module ships in a dev build, and on
// Android. Every call below degrades to a no-op so the timer + notification
// keep working without the Live Activity.
const Native = requireOptionalNativeModule<{
  startActivity(habitName: string, startMs: number, endMs: number): Promise<string | null>;
  endActivity(id: string): Promise<void>;
}>('MeditationActivityModule');

/**
 * Start a lock-screen / Dynamic Island Live Activity for a running meditation
 * timer. Returns the activity id, or null if Live Activities are unavailable
 * or the user has them disabled (the caller treats it as best-effort).
 */
export async function startActivity(
  habitName: string,
  startMs: number,
  endMs: number,
): Promise<string | null> {
  if (Platform.OS !== 'ios' || !Native) return null;
  try {
    return await Native.startActivity(habitName, startMs, endMs);
  } catch {
    return null;
  }
}

/** End a Live Activity by id. Safe to call with a null/stale id (no-op). */
export async function endActivity(id: string | null | undefined): Promise<void> {
  if (!id || !Native) return;
  try {
    await Native.endActivity(id);
  } catch {
    // already ended / not found — ignore.
  }
}
