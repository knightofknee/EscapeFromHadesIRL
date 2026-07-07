import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db, collection, query, where, getDocs } from '@/lib/firebase/firestore';
import type { HabitRecord } from '@/types/habit';

/**
 * One-shot (non-realtime) fetch of the user's records in a date range,
 * (re)fetched whenever `enabled` flips true (e.g. screen focus). For long
 * windows like the 18-month quest average, a live onSnapshot listener would
 * download thousands of docs and re-fire on every record write — and quest
 * scores don't need realtime — so a fetch-on-focus is far cheaper. Keeps the
 * last result while disabled (no flicker when the tab blurs).
 */
// The quests home and detail fetch the IDENTICAL window back-to-back when
// navigating between them (push refetches, pop refocus refetches again) —
// up to habits×549 billed reads each. Share the last result and any in-flight
// fetch per (uid, range). Freshness comes from `invalidateRecordsSnapshotCache`
// (called on every local record write), so the TTL only needs to bound
// cross-device staleness — 5 minutes, versus the old 15s that refetched the
// whole window on nearly every tab hop.
const SNAPSHOT_TTL_MS = 300_000;
let cacheKey: string | null = null;
let cacheRecords: HabitRecord[] | null = null;
let cacheAt = 0;
let inflightKey: string | null = null;
let inflight: Promise<HabitRecord[]> | null = null;

/**
 * Drop the cached snapshot so the next focus refetches. Called when a record
 * is written locally (records-context.recordHabit) so quest scores reflect the
 * change immediately instead of waiting out the TTL.
 */
export function invalidateRecordsSnapshotCache(): void {
  cacheKey = null;
  cacheRecords = null;
  cacheAt = 0;
}

export function useRecordsSnapshot(
  startDate: string,
  endDate: string,
  enabled: boolean,
): { records: HabitRecord[]; isLoading: boolean } {
  const { user } = useAuth();
  const [records, setRecords] = useState<HabitRecord[]>([]);
  // True until the first fetch resolves, so consumers can show a loading
  // state instead of zeroed scores. Refetches-on-focus keep the last data
  // visible and never flip this back.
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRecords([]);
      setIsLoading(true);
      return;
    }
    if (!enabled) return; // keep the last snapshot while off-screen
    const key = `${user.uid}|${startDate}|${endDate}`;
    if (cacheKey === key && cacheRecords && Date.now() - cacheAt < SNAPSHOT_TTL_MS) {
      setRecords(cacheRecords);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!inflight || inflightKey !== key) {
          inflightKey = key;
          inflight = getDocs(
            query(
              collection(db, 'records'),
              where('userId', '==', user.uid),
              where('date', '>=', startDate),
              where('date', '<=', endDate),
            ),
          ).then((snap) => {
            const out = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitRecord);
            cacheKey = key;
            cacheRecords = out;
            cacheAt = Date.now();
            return out;
          });
        }
        const pending = inflight;
        const out = await pending;
        if (inflight === pending) {
          inflight = null;
          inflightKey = null;
        }
        if (!cancelled) {
          setRecords(out);
          setIsLoading(false);
        }
      } catch (e) {
        console.error('useRecordsSnapshot: fetch failed', e);
        if (inflightKey === key) {
          inflight = null;
          inflightKey = null;
        }
        // Unblock consumers — stale/empty scores beat an infinite spinner.
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, startDate, endDate, enabled]);

  return { records, isLoading };
}
