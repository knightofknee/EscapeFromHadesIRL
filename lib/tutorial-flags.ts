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
export type TutorialFeature = 'genesis';

// Bump to re-show a tour to everyone after a meaningful rewrite of its steps.
const VERSION = 'v1';

// Flip true while iterating on the tour to force it to re-appear on every
// refresh (dev builds only — never affects production). Besides re-arming the
// seen-flag below, this also makes the auto-start ignore the "brand-new
// account" guard (see DEV_FORCE_TOUR) so you can preview the flow on an
// account that already has habits/quests.
// TEMP: ON for previewing the intro/tour on the simulator — set back to false before shipping.
const DEV_ALWAYS_SHOW = true;

/** Dev-only: force the Genesis tour to auto-start regardless of account state. */
export const DEV_FORCE_TOUR = __DEV__ && DEV_ALWAYS_SHOW;

const sessionSeen = new Set<TutorialFeature>();

const keyFor = (feature: TutorialFeature, uid: string) =>
  `@efh_tutorial_${feature}_${VERSION}:${uid}`;

/** True once the user has seen (or skipped) the given tutorial. Never throws. */
export async function getSeen(feature: TutorialFeature, uid: string): Promise<boolean> {
  if (sessionSeen.has(feature)) return true;
  if (__DEV__ && DEV_ALWAYS_SHOW) return false;
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
  if (seen) sessionSeen.add(feature);
  else sessionSeen.delete(feature);
  try {
    if (seen) await AsyncStorage.setItem(keyFor(feature, uid), '1');
    else await AsyncStorage.removeItem(keyFor(feature, uid));
  } catch {
    /* ignore — onboarding must not hang on storage */
  }
}

/** Clear the flag so the tutorial can auto-show again ("replay intro"). */
export async function resetSeen(feature: TutorialFeature, uid: string): Promise<void> {
  sessionSeen.delete(feature);
  try {
    await AsyncStorage.removeItem(keyFor(feature, uid));
  } catch {
    /* ignore */
  }
}
