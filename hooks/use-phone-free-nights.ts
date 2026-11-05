import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { useTodayDate } from '@/hooks/use-today-date';
import type { PhoneFreeStatus } from '@/lib/phone-free-source';
import { requestPhoneFreePermission, savePhoneFreeSelection } from '@/lib/phone-free-source';
import type { NightsByDate } from '@/lib/phone-free-storage';
import { snapshotDates, snapshotNights } from '@/lib/phone-free-sync';

/**
 * Keep the last week of phone-free nights snapshotted. Mounted once on the
 * habits screen (alongside useStepsBackfill) so nights are captured daily
 * even if the week view is never opened. Runs on mount, on foreground, and
 * at the midnight rollover (via useTodayDate).
 */
export function usePhoneFreeSnapshot() {
  const { user } = useAuth();
  const { todayStr } = useTodayDate();
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;
    const run = () => {
      snapshotNights(uid, snapshotDates(todayStr)).catch((e) => {
        if (!cancelled) console.error('phone-free snapshot failed:', e);
      });
    };
    run();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [user, todayStr]);
}

/**
 * Status + nights for the given dates (YYYY-MM-DD), for display. Snapshots
 * its own dates on mount/foreground too (a week in the past that the
 * background pass never covered stays empty, which is honest).
 */
export function usePhoneFreeNights(dates: string[]) {
  const { user } = useAuth();
  const [status, setStatus] = useState<PhoneFreeStatus | 'loading'>('loading');
  const [nights, setNights] = useState<NightsByDate>({});
  const datesKey = dates.join(',');
  const dateList = useMemo(() => (datesKey ? datesKey.split(',') : []), [datesKey]);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await snapshotNights(user.uid, dateList);
      setStatus(result.status);
      setNights(result.nights);
    } catch (e) {
      console.error('usePhoneFreeNights refresh failed:', e);
    } finally {
      inFlight.current = false;
    }
  }, [user, dateList]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const requestPermission = useCallback(async () => {
    await requestPhoneFreePermission();
    await refresh();
  }, [refresh]);

  const saveSelection = useCallback(
    async (token: string) => {
      await savePhoneFreeSelection(token);
      await refresh();
    },
    [refresh],
  );

  return { status, nights, refresh, requestPermission, saveSelection };
}
