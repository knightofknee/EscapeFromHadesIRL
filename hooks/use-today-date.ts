import { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import { getTodayString } from '@/lib/date-utils';

/**
 * Returns today's date string (YYYY-MM-DD) and a Date object,
 * automatically updating at midnight and when the app returns to foreground.
 */
export function useTodayDate() {
  const [todayStr, setTodayStr] = useState(getTodayString);
  const [todayDate, setTodayDate] = useState(() => new Date());

  useEffect(() => {
    function refresh() {
      const now = getTodayString();
      if (now !== todayStr) {
        setTodayStr(now);
        setTodayDate(new Date());
      }
    }

    // Check when app comes to foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });

    // Set a timer for midnight
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      setTodayStr(getTodayString());
      setTodayDate(new Date());
    }, msUntilMidnight);

    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [todayStr]);

  return { todayStr, todayDate };
}
