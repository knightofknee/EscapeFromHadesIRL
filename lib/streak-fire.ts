import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The streak fire message: shown once, ever, the first time a quest habit's
 * streak reaches STREAK_FIRE_DAYS. Uid-scoped AsyncStorage, like
 * lib/earned-quotes. Storage failures degrade to "already seen", so the
 * message can never nag.
 */
export const STREAK_FIRE_DAYS = 10;

const keyFor = (uid: string) => `@efh_streak_fire_v1:${uid}`;

export async function hasSeenStreakFire(uid: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(uid))) != null;
  } catch {
    return true;
  }
}

export async function markStreakFireSeen(uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(uid), String(Date.now()));
  } catch {
    /* best-effort */
  }
}

/** Remove the flag (account deletion only). */
export async function clearStreakFireState(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(uid));
  } catch {
    /* best-effort */
  }
}
