import * as Notifications from 'expo-notifications';
import { clearAllTimerState } from '@/lib/meditation-timer-storage';
import { clearAllCreativeWritingFlags } from '@/lib/creative-writing';
import { clearAllVocab } from '@/lib/word-suggestions';

/**
 * Wipe device-local, account-scoped state that Firestore deletion doesn't
 * touch: any scheduled meditation alarm, the per-habit AsyncStorage timer /
 * creative-writing flags, and the notes-derived typing vocabulary. The vocab
 * is cleared here (not just on account deletion) because it is content
 * harvested from the user's private notes and must not linger on a shared
 * device after sign-out — it self-heals by reseeding on the next sign-in.
 * Called on sign-out (which every account-deletion path also runs through).
 *
 * Deliberately does NOT clear the uid-scoped tutorial flags, milestone-quote
 * progress, or device preferences (theme, notes-as-home) — those are meant to
 * persist for a returning user. (Quote progress IS removed on account
 * deletion — see lib/firebase/account-deletion.ts.) Best-effort: a failure
 * here must never block sign-out.
 */
export async function clearLocalUserState(): Promise<void> {
  await Promise.allSettled([
    Notifications.cancelAllScheduledNotificationsAsync(),
    clearAllTimerState(),
    clearAllVocab(),
    clearAllCreativeWritingFlags(),
  ]);
}
