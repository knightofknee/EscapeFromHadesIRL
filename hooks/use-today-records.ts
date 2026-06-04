import { useCallback, useEffect, useMemo } from 'react';
import { useRecordsContext } from '@/contexts/records-context';
import { useTodayDate } from '@/hooks/use-today-date';
import type { HabitRecord, TripleValue, QuadValue } from '@/types/habit';

/**
 * Loads/edits habit records for a specific date. Defaults to today, which
 * auto-advances on midnight/foreground. Pass a date string to pin to a
 * specific day (used by the day navigator in the habits screen).
 *
 * Backed by the shared RecordsProvider (see contexts/records-context.tsx):
 * the day's records are an in-memory slice of the union window, so swiping
 * between days already inside the window no longer tears down and reopens a
 * listener. Return shape is unchanged so call sites don't change.
 */
export function useTodayRecords(dateStr?: string) {
  const { recordsMap, ensureRange, getRecordForDay, recordHabit: ctxRecordHabit } =
    useRecordsContext();
  const { todayStr } = useTodayDate();
  const effectiveDate = dateStr ?? todayStr;

  useEffect(() => {
    ensureRange(effectiveDate, effectiveDate);
  }, [effectiveDate, ensureRange]);

  const records = useMemo(() => {
    const out = new Map<string, HabitRecord>();
    for (const r of recordsMap.values()) {
      if (r.date === effectiveDate) out.set(r.habitId, r);
    }
    return out;
  }, [recordsMap, effectiveDate]);

  const getRecord = useCallback(
    (habitId: string): HabitRecord | undefined => records.get(habitId),
    [records],
  );

  const recordHabit = useCallback(
    (
      habitId: string,
      value: boolean | TripleValue | QuadValue | number | string,
      extra?: { source?: 'auto' | 'manual'; steps?: number },
    ) => {
      ctxRecordHabit(habitId, effectiveDate, value, extra);
    },
    [ctxRecordHabit, effectiveDate],
  );

  // Cycle/toggle helpers read the latest value via getRecordForDay (synchronous
  // off the ref) so rapid taps compose correctly before the next render.
  const toggleBoolean = useCallback(
    (habitId: string) => {
      const current = getRecordForDay(habitId, effectiveDate);
      const newValue = current ? !current.value : true;
      recordHabit(habitId, newValue);
    },
    [getRecordForDay, effectiveDate, recordHabit],
  );

  const cycleTriple = useCallback(
    (habitId: string) => {
      const current = getRecordForDay(habitId, effectiveDate);
      const currentVal = (current?.value as TripleValue) ?? 'no';
      const next: TripleValue =
        currentVal === 'no' ? 'yes' : currentVal === 'yes' ? 'double' : 'no';
      recordHabit(habitId, next);
    },
    [getRecordForDay, effectiveDate, recordHabit],
  );

  const cycleQuad = useCallback(
    (habitId: string) => {
      const current = getRecordForDay(habitId, effectiveDate);
      const currentVal = (current?.value as QuadValue) ?? 'no';
      const next: QuadValue =
        currentVal === 'no'
          ? 'yes'
          : currentVal === 'yes'
            ? 'goal'
            : currentVal === 'goal'
              ? 'ideal'
              : 'no';
      recordHabit(habitId, next);
    },
    [getRecordForDay, effectiveDate, recordHabit],
  );

  const incrementCounter = useCallback(
    (habitId: string) => {
      const current = getRecordForDay(habitId, effectiveDate);
      const currentVal = (current?.value as number) ?? 0;
      recordHabit(habitId, currentVal + 1);
    },
    [getRecordForDay, effectiveDate, recordHabit],
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
