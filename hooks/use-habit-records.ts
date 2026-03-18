import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db, collection, query, where, onSnapshot } from '@/lib/firebase/firestore';
import { formatDate } from '@/lib/date-utils';
import type { HabitRecord } from '@/types/habit';

export { formatDate } from '@/lib/date-utils';

export function useHabitRecords(startDate: string, endDate: string) {
  const { user } = useAuth();
  const [records, setRecords] = useState<HabitRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || !startDate || !endDate) {
      setRecords([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'records'),
      where('userId', '==', user.uid),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as HabitRecord);
      setRecords(data);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [user, startDate, endDate]);

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
