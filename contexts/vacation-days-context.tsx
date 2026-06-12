import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db, collection, query, where } from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
import {
  VACATION_COLLECTION,
  getContiguousBlock as getContiguousBlockPure,
} from '@/lib/vacation-days';
import type { VacationDay } from '@/types/habit';

type VacationDaysContextValue = {
  days: Map<string, VacationDay>;
  dateSet: Set<string>;
  /** True until the first snapshot delivers — the habits home gates on this
   * so a vacation day shows the V tile directly instead of flashing the grid. */
  isLoading: boolean;
  isVacation: (dateStr: string) => boolean;
  getContiguousBlock: (dateStr: string) => string[];
};

const EMPTY_DAYS: Map<string, VacationDay> = new Map();
const EMPTY_SET: Set<string> = new Set();

const VacationDaysContext = createContext<VacationDaysContextValue>({
  days: EMPTY_DAYS,
  dateSet: EMPTY_SET,
  isLoading: true,
  isVacation: () => false,
  getContiguousBlock: () => [],
});

/**
 * Single app-wide subscription to ALL of the user's vacation days, mounted
 * once under the auth gate. Vacation docs are small (label + color + a couple
 * ints), so the full set is fine to hold. Mutations live in lib/vacation-days
 * and vacation-edit-modal — this provider is read-only. Return shape mirrors
 * the old useVacationDays() exactly.
 */
export function VacationDaysProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [days, setDays] = useState<Map<string, VacationDay>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setDays(new Map());
      // Stay "loading" while signed out / auth restoring — see HabitsProvider.
      setIsLoading(true);
      return;
    }

    setIsLoading(true);

    const q = query(
      collection(db, VACATION_COLLECTION),
      where('userId', '==', user.uid),
    );

    // Through the shared offline-aware subscriber so this listener gets the
    // same cold-cache suppression as every other provider — a raw onSnapshot
    // could deliver an empty first snapshot and flash the grid on a vacation
    // day, the exact boot flash the loading architecture exists to kill.
    return subscribeWithOfflineState(
      q,
      (snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => {
        const next = new Map<string, VacationDay>();
        snapshot.docs.forEach((d) => {
          const v = { id: d.id, ...(d.data() as Omit<VacationDay, 'id'>) } as VacationDay;
          next.set(v.date, v);
        });
        setDays(next);
        setIsLoading(false);
      },
      {
        onError: (error) => {
          console.error('[vacationDays] snapshot error:', error);
          // Unblock gated screens — a missing V tile beats an infinite spinner.
          setIsLoading(false);
        },
        setOffline: (offline) => {
          if (offline) setIsLoading(false);
        },
      },
    );
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

  const value = useMemo(
    () => ({ days, dateSet, isLoading, isVacation, getContiguousBlock }),
    [days, dateSet, isLoading, isVacation, getContiguousBlock],
  );

  return <VacationDaysContext.Provider value={value}>{children}</VacationDaysContext.Provider>;
}

export function useVacationDaysContext(): VacationDaysContextValue {
  return useContext(VacationDaysContext);
}
