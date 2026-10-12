// The quests screens' 18-month records snapshot: a one-shot fetch (a live
// listener over 18 months would re-fire on every write), shared across
// screens, saved to the device, and fetched ahead of time.
//
// Why each piece exists:
// - SAVED TO DEVICE: the Firebase Web SDK has no disk cache in React Native,
//   so every launch re-downloaded the whole window before the quests tab could
//   render (slowest on Android). Now the last copy shows instantly and the
//   fresh one replaces it quietly.
// - PREFETCH: RecordsProvider starts the fetch shortly after launch, so the
//   first quests visit usually finds it done.
// - NO INVALIDATE ON WRITE: hooks/use-records-snapshot.ts overlays the live
//   RecordsProvider window (recent days, realtime) on top of this snapshot,
//   so local taps and other devices' writes show up without refetching all
//   18 months. The TTL only refreshes edits OLDER than the live window, which
//   are rare.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, collection, query, where, getDocs } from '@/lib/firebase/firestore';
import type { HabitRecord } from '@/types/habit';

/** Refetch the full window on focus when the snapshot is older than this. */
export const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
const STORAGE_PREFIX = 'recordsSnapshot.v1:';

export type RecordsSnapshot = {
  uid: string;
  start: string;
  end: string;
  /** Epoch ms of the fetch that produced it. */
  at: number;
  records: HabitRecord[];
};

let current: RecordsSnapshot | null = null;
let inflight: { key: string; promise: Promise<RecordsSnapshot> } | null = null;
const hydrating = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
/** Fetch keys whose result must be dropped: sign-out happened while they ran. */
const signedOutDuringFetch = new Set<string>();

const keyOf = (uid: string, start: string, end: string) => `${uid}|${start}|${end}`;

function publish(snapshot: RecordsSnapshot) {
  current = snapshot;
  for (const l of listeners) l();
}

/** The latest snapshot for this account, or null. */
export function getRecordsSnapshot(uid: string): RecordsSnapshot | null {
  return current?.uid === uid ? current : null;
}

export function subscribeRecordsSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True when the snapshot covers a different window or has aged past the TTL. */
export function isSnapshotStale(snapshot: RecordsSnapshot, start: string, end: string): boolean {
  return snapshot.start !== start || snapshot.end !== end || Date.now() - snapshot.at > SNAPSHOT_TTL_MS;
}

/**
 * Load the saved copy for this account into memory (once per account per
 * session). A fresher in-memory snapshot always wins over the saved one.
 */
export function hydrateRecordsSnapshot(uid: string): Promise<void> {
  if (getRecordsSnapshot(uid)) return Promise.resolve();
  let pending = hydrating.get(uid);
  if (!pending) {
    pending = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_PREFIX + uid);
        if (!raw) return;
        const saved = JSON.parse(raw) as RecordsSnapshot;
        if (saved?.uid !== uid || !Array.isArray(saved.records)) return;
        if (getRecordsSnapshot(uid)) return; // a fetch landed first
        publish(saved);
      } catch {
        // A missing or corrupt copy just means waiting on the network.
      }
    })();
    hydrating.set(uid, pending);
  }
  return pending;
}

/** Fetch the window from Firestore (deduped while in flight), then publish and save it. */
export function fetchRecordsSnapshot(uid: string, start: string, end: string): Promise<RecordsSnapshot> {
  const key = keyOf(uid, start, end);
  if (inflight?.key === key) return inflight.promise;
  const promise = getDocs(
    query(
      collection(db, 'records'),
      where('userId', '==', uid),
      where('date', '>=', start),
      where('date', '<=', end),
    ),
  )
    .then((snap) => {
      const snapshot: RecordsSnapshot = {
        uid,
        start,
        end,
        at: Date.now(),
        records: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitRecord),
      };
      // Signed out (or switched accounts) mid-fetch: don't publish or save it.
      if (!signedOutDuringFetch.has(key)) {
        publish(snapshot);
        AsyncStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify(snapshot)).catch(() => {});
      }
      return snapshot;
    })
    .finally(() => {
      signedOutDuringFetch.delete(key);
      if (inflight?.key === key) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

/**
 * Background warm-up: load the saved copy, then refetch if it's missing or
 * stale. Never throws.
 */
export async function prefetchRecordsSnapshot(uid: string, start: string, end: string): Promise<void> {
  try {
    await hydrateRecordsSnapshot(uid);
    const snap = getRecordsSnapshot(uid);
    if (!snap || isSnapshotStale(snap, start, end)) await fetchRecordsSnapshot(uid, start, end);
  } catch (e) {
    console.warn('[records snapshot] prefetch failed', e);
  }
}

/**
 * The window's records: the live listener's records own the days it covers
 * (`liveRange`, realtime), the snapshot supplies everything older. Live
 * records outside [start, end] are left out.
 */
export function mergeWithLive(
  snapshotRecords: HabitRecord[],
  live: Iterable<HabitRecord>,
  liveRange: { start: string; end: string } | null,
  start: string,
  end: string,
): HabitRecord[] {
  if (!liveRange) return snapshotRecords;
  const out = snapshotRecords.filter((r) => r.date < liveRange.start || r.date > liveRange.end);
  for (const r of live) {
    if (r.date >= start && r.date <= end) out.push(r);
  }
  return out;
}

/** Sign-out: forget every account's snapshot, in memory and on the device. */
export async function clearRecordsSnapshots(): Promise<void> {
  current = null;
  hydrating.clear();
  if (inflight) {
    // Drop its result, and let a sign-in right after start a fresh fetch
    // instead of awaiting this one.
    signedOutDuringFetch.add(inflight.key);
    inflight = null;
  }
  for (const l of listeners) l();
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(STORAGE_PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Best-effort, like the rest of the sign-out sweep.
  }
}
