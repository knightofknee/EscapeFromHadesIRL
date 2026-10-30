import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { arrayRemove, arrayUnion } from 'firebase/firestore';
import { db, doc, setDoc } from '@/lib/firebase/firestore';

export const PUSH_TOKENS_COLLECTION = 'pushTokens';

/** This phone's IANA time zone, so the server rings shared reminders at local time. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

let lastToken: string | null = null;

/**
 * Store this phone's Expo push token (and time zone) under the user, so the
 * Cloud Functions can push shared-chore reminders and "Sam did it". Only
 * when notifications are already granted (never prompts). Safe to call
 * often; failures are logged, never thrown (no push on a simulator without
 * APNs, offline, etc.).
 */
export async function registerPushToken(uid: string): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    lastToken = token;
    await setDoc(
      doc(db, PUSH_TOKENS_COLLECTION, uid),
      { userId: uid, tokens: arrayUnion(token), timeZone: deviceTimeZone(), updatedAt: Date.now() },
      { merge: true },
    );
  } catch (e) {
    console.warn('[push] register failed', e);
  }
}

/** Drop this phone's token before signing out, so the old account stops pushing here. */
export async function unregisterPushToken(uid: string): Promise<void> {
  if (!lastToken) return;
  try {
    await setDoc(doc(db, PUSH_TOKENS_COLLECTION, uid), { tokens: arrayRemove(lastToken) }, { merge: true });
  } catch (e) {
    console.warn('[push] unregister failed', e);
  }
}
