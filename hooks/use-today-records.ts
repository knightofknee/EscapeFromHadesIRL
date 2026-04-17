import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, setDoc, query, collection, where, onSnapshot } from '@/lib/firebase/firestore';
import { getTodayString } from '@/lib/date-utils';
import { useTodayDate } from '@/hooks/use-today-date';
import type { HabitRecord, TripleValue, QuadValue } from '@/types/habit';

/**
 * Loads/edits habit records for a specific date. Defaults to today, which
 * auto-advances on midnight/foreground. Pass a date string to pin to a
 * specific day (used by the day navigator in the habits screen).
 */
export function useTodayRecords(dateStr?: string) {
  const { user } = useAuth();
  const [records, setRecords] = useState<Map<string, HabitRecord>>(new Map());
  const localCache = useRef<Map<string, HabitRecord>>(new Map());
  const { todayStr } = useTodayDate();
  const effectiveDate = dateStr ?? todayStr;
  const activeDate = useRef(effectiveDate);

  // Keep ref in sync with the effective date (pinned or today rollover)
  const [dateKey, setDateKey] = useState(effectiveDate);
  useEffect(() => {
    if (effectiveDate !== activeDate.current) {
      activeDate.current = effectiveDate;
      setDateKey(effectiveDate);
    }
  }, [effectiveDate]);

  useEffect(() => {
    if (!user) return;

    activeDate.current = effectiveDate;

    const q = query(
      collection(db, 'records'),
      where('userId', '==', user.uid),
      where('date', '==', activeDate.current),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const map = new Map<string, HabitRecord>();
      snapshot.docs.forEach((d) => {
        const record = { id: d.id, ...d.data() } as HabitRecord;
        map.set(record.habitId, record);
      });
      localCache.current = map;
      setRecords(new Map(map));
    });

    return unsubscribe;
  }, [user, dateKey]);

  const getRecord = useCallback(
    (habitId: string): HabitRecord | undefined => {
      return records.get(habitId);
    },
    [records],
  );

  const recordHabit = useCallback(
    (habitId: string, value: boolean | TripleValue | QuadValue | number | string) => {
      if (!user) return;

      const docId = `${habitId}_${activeDate.current}`;
      const record: HabitRecord = {
        id: docId,
        habitId,
        userId: user.uid,
        date: activeDate.current,
        value,
        recordedAt: Date.now(),
      };

      // Optimistic local update — instant feel
      localCache.current.set(habitId, record);
      setRecords(new Map(localCache.current));

      // Background Firestore write — no await, but catch errors
      const ref = doc(db, 'records', docId);
      setDoc(ref, record).catch((err) => {
        console.error('Failed to save habit record:', err);
      });
    },
    [user],
  );

  const toggleBoolean = useCallback(
    (habitId: string) => {
      const current = localCache.current.get(habitId);
      const newValue = current ? !current.value : true;
      recordHabit(habitId, newValue);
    },
    [recordHabit],
  );

  const cycleTriple = useCallback(
    (habitId: string) => {
      const current = localCache.current.get(habitId);
      const currentVal = (current?.value as TripleValue) ?? 'no';
      const next: TripleValue =
        currentVal === 'no' ? 'yes' : currentVal === 'yes' ? 'double' : 'no';
      recordHabit(habitId, next);
    },
    [recordHabit],
  );

  const cycleQuad = useCallback(
    (habitId: string) => {
      const current = localCache.current.get(habitId);
      const currentVal = (current?.value as QuadValue) ?? 'no';
      const next: QuadValue =
        currentVal === 'no' ? 'yes' : currentVal === 'yes' ? 'goal' : currentVal === 'goal' ? 'ideal' : 'no';
      recordHabit(habitId, next);
    },
    [recordHabit],
  );

  const incrementCounter = useCallback(
    (habitId: string) => {
      const current = localCache.current.get(habitId);
      const currentVal = (current?.value as number) ?? 0;
      recordHabit(habitId, currentVal + 1);
    },
    [recordHabit],
  );

  const resetCounter = useCallback(
    (habitId: string) => {
      recordHabit(habitId, 0);
    },
    [recordHabit],
  );

  const setValue = useCallback(
    (habitId: string, value: string) => {
      recordHabit(habitId, value);
    },
    [recordHabit],
  );

  return {
    records,
    getRecord,
    recordHabit,
    toggleBoolean,
    cycleTriple,
    cycleQuad,
    incrementCounter,
    resetCounter,
    setValue,
  };
}
