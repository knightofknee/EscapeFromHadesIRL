import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted "has seen this tutorial" flags. Mirrors the bekin8 pattern: a
 * uid-scoped, version-stamped AsyncStorage key plus a module-scope session
 * cache so a render can ask getSeen() repeatedly without thrashing storage,
 * and so a JS reload re-arms the once-per-session guards.
 *
 * Onboarding must never be BLOCKED by a storage failure, so every call
 * swallows its error and degrades to "not seen / no-op".
 */
export type TutorialFeature = 'genesis' | 'calendar-tips';

// Bump to re-show a tour to everyone after a meaningful rewrite of its steps.
const VERSION = 'v1';

// Flip a feature true while iterating on it to force it to re-appear on
// every refresh (dev builds only — never affects production). For the
// Genesis tour this also makes the auto-start ignore the "brand-new
// account" guard (see DEV_FORCE_TOUR) so the flow can be previewed on an
// account that already has habits/quests; leave it false to see the tour
// only on new accounts, like production.
const DEV_ALWAYS_SHOW: Record<TutorialFeature, boolean> = {
  genesis: false,
  // TEMP: ON to preview the Month-view calendar tips on every reload.
  'calendar-tips': true,
};

/** Dev-only: force the Genesis tour to auto-start regardless of account state. */
export const DEV_FORCE_TOUR = __DEV__ && DEV_ALWAYS_SHOW.genesis;

// Session cache is keyed by feature AND uid: a bare feature key would mark the
// tour "seen" for every account signed into during this app session, so a
// brand-new account created right after another user's tour would silently
// never get its own intro.
const sessionSeen = new Set<string>();

const keyFor = (feature: TutorialFeature, uid: string) =>
  `@efh_tutorial_${feature}_${VERSION}:${uid}`;

const sessionKeyFor = (feature: TutorialFeature, uid: string) => `${feature}:${uid}`;

/** True once the user has seen (or skipped) the given tutorial. Never throws. */
export async function getSeen(feature: TutorialFeature, uid: string): Promise<boolean> {
  if (sessionSeen.has(sessionKeyFor(feature, uid))) return true;
  if (__DEV__ && DEV_ALWAYS_SHOW[feature]) return false;
  try {
    const v = await AsyncStorage.getItem(keyFor(feature, uid));
    return v === '1';
  } catch {
    return false;
  }
}

/** Mark a tutorial seen (default) or clear it. Fire-and-forget; never throws. */
export async function setSeen(
  feature: TutorialFeature,
  seen: boolean,
  uid: string,
): Promise<void> {
  if (seen) sessionSeen.add(sessionKeyFor(feature, uid));
  else sessionSeen.delete(sessionKeyFor(feature, uid));
  try {
    if (seen) await AsyncStorage.setItem(keyFor(feature, uid), '1');
    else await AsyncStorage.removeItem(keyFor(feature, uid));
  } catch {
    /* ignore — onboarding must not hang on storage */
  }
}

/** Clear the flag so the tutorial can auto-show again ("replay intro"). */
export async function resetSeen(feature: TutorialFeature, uid: string): Promise<void> {
  sessionSeen.delete(sessionKeyFor(feature, uid));
  try {
    await AsyncStorage.removeItem(keyFor(feature, uid));
  } catch {
    /* ignore */
  }
}
