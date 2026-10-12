// Remote minimum-version gate (the hard block), ported from BeKin's
// lib/updateGate.ts. Config/app.latestVersion WARNS (lib/app-update.ts,
// snoozable); Config/app.minVersion BLOCKS (androidMinBuild on Android, a
// versionCode; see lib/app-update.ts for why): builds older than it get
// components/ui/update-required-gate.tsx, a full-screen screen with no way
// past it but the store.
//
// Use it when a backend change (rules, data shape) would break an older build.
// A gate only works in builds that CONTAIN it: binaries released before this
// file existed have no such check, so the floor protects the NEXT breaking
// change, not ones already installed.
//
// FAIL-OPEN BY DESIGN: a missing doc, a denied read, a malformed version, an
// unknown running version, or any thrown error all resolve to "do not block".
// A remote value that could brick every install is far more dangerous than
// one that occasionally fails to gate.
import { doc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { behindDial } from '@/lib/app-update';
import { db } from '@/lib/firebase/firestore';

export type UpdateGate = {
  /** Lowest release allowed to run (Config/app.minVersion, or "android build N"). */
  minVersion: string;
  /** Config/app.message, or null for the built-in copy. */
  message: string | null;
  /** This platform's store link, or null when none is configured. */
  storeUrl: string | null;
};

/** Resolves with the block to show, or null when this build may run. Never throws. */
export async function fetchUpdateGate(): Promise<UpdateGate | null> {
  // Dev builds report the in-progress version; never lock out a developer.
  if (__DEV__) return null;
  try {
    const snap = await getDoc(doc(db, 'Config', 'app'));
    if (!snap.exists()) return null;
    const data = snap.data();
    const minVersion = behindDial(data, 'min');
    if (!minVersion) return null;
    const url = Platform.OS === 'ios' ? data?.iosUrl : data?.androidUrl;
    const message = typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : null;
    return { minVersion, message, storeUrl: typeof url === 'string' && url ? url : null };
  } catch {
    return null;
  }
}
