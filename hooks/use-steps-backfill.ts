import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, getDoc, updateDoc } from '@/lib/firebase/firestore';
import { persistHabitRecord } from '@/lib/persist-record';
import { getTodayString } from '@/lib/date-utils';
import { computeStepsLevel, unconfirmedStepDays } from '@/lib/steps';
import { getStepsForDay } from '@/lib/steps-health';
import { useHabits } from '@/hooks/use-habits';
import { useTodayDate } from '@/hooks/use-today-date';
import type { Habit, HabitRecord } from '@/types/habit';

/**
 * Keep step records in sync with the health platform. Two jobs per sync:
 *
 *  1. Today, live: re-fetch today's running count for every Steps habit and
 *     persist it, so the grid is fresh while the day is in progress.
 *  2. Confirm ended days: a day's record is otherwise only as fresh as the
 *     last sync that happened that day — open the app at 7am, never again,
 *     and the day is frozen at the 7am count. Each sync writes the FINAL
 *     count for every ended day after `habit.stepsConfirmedThrough`, then
 *     advances the pointer. The health platforms keep history, so this
 *     self-heals no matter how long the app stayed closed.
 *
 * Runs on mount, on AppState → 'active', and at the midnight rollover (via
 * useTodayDate re-arming the effect). Throttled to one sync per 30s — but
 * the throttle never swallows a sync for a NEW day or a newly added steps
 * habit, only repeats of the same work.
 */
export function useStepsBackfill() {
  const { user } = useAuth();
  const { habits } = useHabits();
  const { todayStr } = useTodayDate();
  const lastSyncAtRef = useRef<number>(0);
  const lastSyncDayRef = useRef<string>('');
  const lastSyncHabitsRef = useRef<string>('');
  /** habitId → `${date}|${steps}|${goals}` of the last live write, to skip no-op rewrites. */
  const lastLiveWriteRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user) return;
    const stepsHabits = habits.filter((h) => h.recordingMode === 'steps');
    if (stepsHabits.length === 0) return;

    const writeRecord = async (habit: Habit, date: string, steps: number) => {
      const docId = `${habit.id}_${date}`;
      const next: HabitRecord = {
        id: docId,
        habitId: habit.id,
        userId: user.uid,
        date,
        value: computeStepsLevel(steps, habit.stepGoals ?? []),
        recordedAt: Date.now(),
        source: 'auto',
        steps,
      };
      // Silent: this runs automatically in the background and self-heals on the
      // next sync, so a failed write shouldn't pop a toast the user can't act on.
      await persistHabitRecord(next, { silent: true });
    };

    /**
     * Write final counts for the habit's unconfirmed ended days, then
     * advance `stepsConfirmedThrough`. Records that didn't come from auto
     * sync are never overwritten (manual wins); on a habit that predates
     * the pointer, days before its first auto record are out of scope —
     * it wasn't a steps habit yet.
     */
    const confirmEndedDays = async (
      habit: Habit,
      today: string,
      stepsFor: (date: string) => Promise<number | null>,
    ) => {
      const days = unconfirmedStepDays(habit.stepsConfirmedThrough, today, habit.createdAt);
      if (days.length === 0) return;

      const existing = await Promise.all(
        days.map(async (date) => {
          const snap = await getDoc(doc(db, 'records', `${habit.id}_${date}`));
          return snap.exists() ? (snap.data() as HabitRecord) : undefined;
        }),
      );

      let scopeStart = days[0];
      if (!habit.stepsConfirmedThrough) {
        const firstAuto = existing.findIndex((r) => r?.source === 'auto');
        if (firstAuto === -1) {
          // Never auto-synced before: no past days to fix; confirm from today on.
          await updateDoc(doc(db, 'habits', habit.id), {
            stepsConfirmedThrough: days[days.length - 1],
          });
          return;
        }
        scopeStart = days[firstAuto];
      }

      let confirmedThrough: string | undefined;
      for (let i = 0; i < days.length; i++) {
        const date = days[i];
        const record = existing[i];
        if (date >= scopeStart && (!record || record.source === 'auto')) {
          const steps = await stepsFor(date);
          if (steps == null) break; // health read failed — retry from here next sync
          await writeRecord(habit, date, steps);
        }
        confirmedThrough = date;
      }
      // Monotonic: a stale writer (slow resume, second device) must never
      // move the pointer backward.
      if (
        confirmedThrough &&
        (!habit.stepsConfirmedThrough || confirmedThrough > habit.stepsConfirmedThrough)
      ) {
        await updateDoc(doc(db, 'habits', habit.id), { stepsConfirmedThrough: confirmedThrough });
      }
    };

    const sync = async () => {
      // AppState listeners run before React re-renders useTodayDate's state,
      // so on the first foreground of a new day the closure's todayStr is
      // still yesterday — always resolve the day fresh at sync time.
      const today = getTodayString();
      const habitsKey = stepsHabits
        .map((h) => h.id)
        .sort()
        .join(',');
      const now = Date.now();
      if (
        now - lastSyncAtRef.current < 30_000 &&
        lastSyncDayRef.current === today &&
        lastSyncHabitsRef.current === habitsKey
      ) {
        return;
      }
      lastSyncAtRef.current = now;
      lastSyncDayRef.current = today;
      lastSyncHabitsRef.current = habitsKey;

      // One health read per calendar day per sync, shared across habits.
      const dayCache = new Map<string, number | null>();
      const stepsFor = async (date: string): Promise<number | null> => {
        if (!dayCache.has(date)) dayCache.set(date, await getStepsForDay(date));
        return dayCache.get(date) ?? null;
      };

      const todaySteps = await stepsFor(today);
      if (todaySteps != null) {
        for (const habit of stepsHabits) {
          const writeKey = `${today}|${todaySteps}|${(habit.stepGoals ?? []).join(',')}`;
          if (lastLiveWriteRef.current.get(habit.id) === writeKey) continue;
          try {
            await writeRecord(habit, today, todaySteps);
            lastLiveWriteRef.current.set(habit.id, writeKey);
          } catch (err) {
            console.error('Steps backfill write failed:', err);
          }
        }
      }

      for (const habit of stepsHabits) {
        try {
          await confirmEndedDays(habit, today, stepsFor);
        } catch (err) {
          console.error('Steps day confirmation failed:', err);
        }
      }
    };

    void sync();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => sub.remove();
  }, [user, habits, todayStr]);
}
