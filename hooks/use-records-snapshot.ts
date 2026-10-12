import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRecordsContext } from '@/contexts/records-context';
import {
  fetchRecordsSnapshot,
  getRecordsSnapshot,
  hydrateRecordsSnapshot,
  isSnapshotStale,
  mergeWithLive,
  subscribeRecordsSnapshot,
  type RecordsSnapshot,
} from '@/lib/records-snapshot-store';
import type { HabitRecord } from '@/types/habit';

/**
 * The user's records over a long window (the quests' 18 months) without a
 * live 18-month listener. Two layers:
 * - the shared snapshot (lib/records-snapshot-store): saved on the device so
 *   it renders instantly, refetched on focus once past its TTL, prefetched at
 *   launch;
 * - the live RecordsProvider window laid over it: recent days come from the
 *   realtime listener, so a habit tap (or another device's write) shows up at
 *   once with no refetch.
 * `isLoading` is true only until the first snapshot (saved or fetched) exists
 * for this account; later refetches keep the current data on screen.
 */
export function useRecordsSnapshot(
  startDate: string,
  endDate: string,
  enabled: boolean,
): { records: HabitRecord[]; isLoading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { recordsMap, loadedRange } = useRecordsContext();
  const [snapshot, setSnapshot] = useState<RecordsSnapshot | null>(() =>
    uid ? getRecordsSnapshot(uid) : null,
  );
  // A failed first fetch unblocks the screen (stale/empty scores beat an
  // infinite spinner).
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const sync = () => setSnapshot(getRecordsSnapshot(uid));
    sync();
    return subscribeRecordsSnapshot(sync);
  }, [uid]);

  useEffect(() => {
    if (!uid || !enabled) return; // off-screen: keep what's shown
    let cancelled = false;
    (async () => {
      await hydrateRecordsSnapshot(uid);
      const snap = getRecordsSnapshot(uid);
      if (snap && !isSnapshotStale(snap, startDate, endDate)) return;
      try {
        await fetchRecordsSnapshot(uid, startDate, endDate);
      } catch (e) {
        console.error('useRecordsSnapshot: fetch failed', e);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, startDate, endDate, enabled]);

  const records = useMemo(() => {
    if (!uid || snapshot?.uid !== uid) return [];
    return mergeWithLive(snapshot.records, recordsMap.values(), loadedRange, startDate, endDate);
  }, [uid, snapshot, recordsMap, loadedRange, startDate, endDate]);

  const isLoading = !uid || (snapshot?.uid !== uid && !failed);
  return { records, isLoading };
}
