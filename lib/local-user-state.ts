import * as Notifications from 'expo-notifications';
import { clearAllTimerState } from '@/lib/meditation-timer-storage';
import { clearAllCreativeWritingFlags } from '@/lib/creative-writing';

/**
 * Wipe device-local, account-scoped state that Firestore deletion doesn't
 * touch: any scheduled meditation alarm and the per-habit AsyncStorage timer /
 * creative-writing flags. Called on sign-out (which every account-deletion
 * path also runs through), so a scheduled alarm can't fire for a signed-out or
 * deleted account and no per-habit state leaks into the next session.
 *
 * Deliberately does NOT clear the uid-scoped tutorial flags or device
 * preferences (theme, notes-as-home) — those are meant to persist. Best-effort:
 * a failure here must never block sign-out.
 */
export async function clearLocalUserState(): Promise<void> {
  await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    clearAllTimerState(),
    clearAllCreativeWritingFlags(),
  ]);
}
