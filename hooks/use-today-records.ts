import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, setDoc, query, collection, where, onSnapshot } from '@/lib/firebase/firestore';
import { getTodayString } from '@/lib/date-utils';
import type { HabitRecord, TripleValue } from '@/types/habit';

export function useTodayRecords() {
  const { user } = useAuth();
  const [records, setRecords] = useState<Map<string, HabitRecord>>(new Map());
  const localCache = useRef<Map<string, HabitRecord>>(new Map());
  const today = useRef(getTodayString());

  // Refresh the date when the app comes back to foreground (handles midnight rollover)
  const [dateKey, setDateKey] = useState(getTodayString());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const now = getTodayString();
        if (now !== today.current) {
          today.current = now;
          setDateKey(now);
        }
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!user) return;

    today.current = getTodayString();

    const q = query(
      collection(db, 'records'),
      where('userId', '==', user.uid),
      where('date', '==', today.current),
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
    (habitId: string, value: boolean | TripleValue | number | string) => {
      if (!user) return;

      const docId = `${habitId}_${today.current}`;
      const record: HabitRecord = {
        id: docId,
        habitId,
        userId: user.uid,
        date: today.current,
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
    incrementCounter,
    resetCounter,
    setValue,
  };
}
