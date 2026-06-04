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
export function useRecordsSnapshot(
  startDate: string,
  endDate: string,
  enabled: boolean,
): HabitRecord[] {
  const { user } = useAuth();
  const [records, setRecords] = useState<HabitRecord[]>([]);

  useEffect(() => {
    if (!user) {
      setRecords([]);
      return;
    }
    if (!enabled) return; // keep the last snapshot while off-screen
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'records'),
            where('userId', '==', user.uid),
            where('date', '>=', startDate),
            where('date', '<=', endDate),
          ),
        );
        if (!cancelled) {
          setRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitRecord));
        }
      } catch (e) {
        console.error('useRecordsSnapshot: fetch failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, startDate, endDate, enabled]);

  return records;
}
