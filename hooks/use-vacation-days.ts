import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  db,
  collection,
  query,
  where,
  onSnapshot,
} from '@/lib/firebase/firestore';
import {
  VACATION_COLLECTION,
  getContiguousBlock as getContiguousBlockPure,
} from '@/lib/vacation-days';
import type { VacationDay } from '@/types/habit';

/**
 * Subscribes to ALL of the current user's vacation days and exposes
 * lookup + contiguous-block helpers. Vacation metadata is small per doc
 * (label + color + a couple of ints), so loading the full set is fine
 * for the foreseeable future. If users ever rack up thousands of vacation
 * days, swap to a date-range subscription scoped to the current view.
 */
export function useVacationDays() {
  const { user } = useAuth();
  const [days, setDays] = useState<Map<string, VacationDay>>(new Map());

  useEffect(() => {
    if (!user) {
      setDays(new Map());
      return;
    }

    const q = query(
      collection(db, VACATION_COLLECTION),
      where('userId', '==', user.uid),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next = new Map<string, VacationDay>();
      snapshot.docs.forEach((d) => {
        const v = { id: d.id, ...d.data() } as VacationDay;
        next.set(v.date, v);
      });
      setDays(next);
    });

    return unsubscribe;
  }, [user]);

  /** Date set, useful where only existence matters (stats, etc.). */
  const dateSet = useMemo(() => new Set(days.keys()), [days]);

  /** True iff the given YYYY-MM-DD is currently a vacation day. */
  const isVacation = useCallback(
    (dateStr: string) => dateSet.has(dateStr),
    [dateSet],
  );

  /**
   * Returns the full contiguous run of vacation dates that contains
   * `dateStr` (inclusive). If `dateStr` itself is not a vacation day,
   * returns an empty array. Used by "apply to full vacation" edits.
   * Logic lives in lib/vacation-days for testability.
   */
  const getContiguousBlock = useCallback(
    (dateStr: string): string[] => getContiguousBlockPure(dateStr, dateSet),
    [dateSet],
  );

  return {
    days,
    dateSet,
    isVacation,
    getContiguousBlock,
  };
}
