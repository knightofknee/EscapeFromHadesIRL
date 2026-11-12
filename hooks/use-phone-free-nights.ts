import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { useHabits } from '@/hooks/use-habits';
import { useTodayDate } from '@/hooks/use-today-date';
import { formatDate, getTodayString } from '@/lib/date-utils';
import { db, doc, getDoc } from '@/lib/firebase/firestore';
import { persistHabitRecord } from '@/lib/persist-record';
import { computePhoneFreeLevel } from '@/lib/phone-free';
import type { PhoneFreeStatus } from '@/lib/phone-free-source';
import { requestPhoneFreePermission, savePhoneFreeSelection } from '@/lib/phone-free-source';
import type { NightsByDate } from '@/lib/phone-free-storage';
import { snapshotDates, snapshotNights } from '@/lib/phone-free-sync';
import type { HabitRecord } from '@/types/habit';

/**
 * External sync triggers, same pattern as useStepsBackfill: the setup flow
 * (permission granted, apps chosen) fires one so the tile fills in now
 * instead of on the next foreground.
 */
const syncListeners = new Set<() => void>();

export function requestPhoneFreeSync(): void {
  for (const listener of [...syncListeners]) listener();
}

/**
 * Keep phone-free habits recorded. Two jobs per run:
 *
 *  1. Snapshot the last week of nights into local storage (the sources
 *     forget within days), whether or not a phone-free habit exists yet.
 *  2. For every phone-free habit, write a record for each stored night from
 *     the habit's creation day on: tier from the habit's hour goals, raw
 *     phone-free ms on the record. Re-derives when goals change; never
 *     touches a record that was entered by hand.
 *
 * Mounted once on the habits screen. Runs on mount, on foreground, at the
 * midnight rollover (useTodayDate), and when setup completes.
 */
export function usePhoneFreeBackfill() {
  const { user } = useAuth();
  const { habits } = useHabits();
  const { todayStr } = useTodayDate();
  /** `${habitId}_${date}` → `${ms}|${goals}` last confirmed on the server. */
  const writtenRef = useRef<Map<string, string>>(new Map());
  const lastRunAtRef = useRef(0);
  const lastRunKeyRef = useRef('');

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let cancelled = false;
    const phoneFreeHabits = habits.filter((h) => h.recordingMode === 'phoneFree');

    const run = async (force = false) => {
      // Day resolved at run time: the first foreground of a new day fires
      // before useTodayDate re-renders.
      const today = getTodayString();
      const key = `${today}|${phoneFreeHabits.map((h) => `${h.id}:${(h.phoneFreeGoals ?? []).join(',')}`).sort().join(';')}`;
      const now = Date.now();
      if (!force && now - lastRunAtRef.current < 30_000 && lastRunKeyRef.current === key) return;
      lastRunAtRef.current = now;
      lastRunKeyRef.current = key;

      const dates = snapshotDates(today);
      const { status, nights } = await snapshotNights(uid, dates);
      if (cancelled || status !== 'ready' || phoneFreeHabits.length === 0) return;

      for (const habit of phoneFreeHabits) {
        const goals = habit.phoneFreeGoals ?? [];
        const createdDay = formatDate(new Date(habit.createdAt));
        for (const date of dates) {
          if (date < createdDay) continue;
          const night = nights[date];
          if (!night) continue;
          const docId = `${habit.id}_${date}`;
          const sig = `${night.phoneFreeMs}|${goals.join(',')}`;
          if (writtenRef.current.get(docId) === sig) continue;
          try {
            const snap = await getDoc(doc(db, 'records', docId));
            const existing = snap.exists() ? (snap.data() as HabitRecord) : undefined;
            if (cancelled) return;
            const value = computePhoneFreeLevel(night.phoneFreeMs, goals);
            if (
              existing?.source === 'manual' ||
              (existing && existing.phoneFreeMs === night.phoneFreeMs && existing.value === value)
            ) {
              writtenRef.current.set(docId, sig);
              continue;
            }
            const ok = await persistHabitRecord(
              {
                id: docId,
                habitId: habit.id,
                userId: uid,
                date,
                value,
                recordedAt: Date.now(),
                source: 'auto',
                phoneFreeMs: night.phoneFreeMs,
              },
              { silent: true },
            );
            if (ok) writtenRef.current.set(docId, sig);
          } catch (e) {
            console.error('phone-free record write failed:', docId, e);
          }
        }
      }
    };

    const start = (force = false) => {
      run(force).catch((e) => {
        if (!cancelled) console.error('phone-free backfill failed:', e);
      });
    };
    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') start();
    });
    const requested = () => start(true);
    syncListeners.add(requested);
    return () => {
      cancelled = true;
      sub.remove();
      syncListeners.delete(requested);
    };
  }, [user, habits, todayStr]);
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
  /** Wall-clock ms of the last refresh, for "has this night ended" reads in render. */
  const [checkedAt, setCheckedAt] = useState(0);
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
      setCheckedAt(Date.now());
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
    requestPhoneFreeSync();
  }, [refresh]);

  const saveSelection = useCallback(
    async (token: string) => {
      await savePhoneFreeSelection(token);
      await refresh();
      requestPhoneFreeSync();
    },
    [refresh],
  );

  return { status, nights, checkedAt, refresh, requestPermission, saveSelection };
}
