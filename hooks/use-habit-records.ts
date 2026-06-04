import { useEffect, useMemo } from 'react';
import { useRecordsContext } from '@/contexts/records-context';
import { formatDate } from '@/lib/date-utils';
import type { HabitRecord } from '@/types/habit';

export { formatDate } from '@/lib/date-utils';

/**
 * Records for a date range. Backed by the shared RecordsProvider's single
 * union-window listener (see contexts/records-context.tsx): this hook
 * registers its [startDate, endDate] and serves the result by in-memory
 * filtering. Return shape is unchanged so call sites don't change.
 */
export function useHabitRecords(startDate: string, endDate: string) {
  const { recordsMap, loadedRange, ensureRange } = useRecordsContext();

  useEffect(() => {
    if (startDate && endDate) ensureRange(startDate, endDate);
  }, [startDate, endDate, ensureRange]);

  const records = useMemo(() => {
    if (!startDate || !endDate) return [];
    const out: HabitRecord[] = [];
    for (const r of recordsMap.values()) {
      if (r.date >= startDate && r.date <= endDate) out.push(r);
    }
    return out;
  }, [recordsMap, startDate, endDate]);

  // Group by date (memoized to avoid new object on every render)
  const recordsByDate = useMemo(
    () =>
      records.reduce(
        (acc, record) => {
          if (!acc[record.date]) acc[record.date] = new Map();
          acc[record.date].set(record.habitId, record);
          return acc;
        },
        {} as Record<string, Map<string, HabitRecord>>,
      ),
    [records],
  );

  const isLoading =
    startDate && endDate
      ? !(loadedRange && loadedRange.start <= startDate && loadedRange.end >= endDate)
      : false;

  return { records, recordsByDate, isLoading };
}

export function getWeekDates(refDate: Date): { dates: Date[]; startDate: string; endDate: string } {
  const day = refDate.getDay();
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() - ((day + 6) % 7));

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }

  return {
    dates,
    startDate: formatDate(dates[0]),
    endDate: formatDate(dates[6]),
  };
}
