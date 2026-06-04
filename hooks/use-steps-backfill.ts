import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, setDoc } from '@/lib/firebase/firestore';
import { computeStepsLevel } from '@/lib/steps';
import { getStepsForDay } from '@/lib/steps-health';
import { useHabits } from '@/hooks/use-habits';
import { useTodayDate } from '@/hooks/use-today-date';
import type { HabitRecord } from '@/types/habit';

/**
 * Re-fetch today's step count for every Steps Counter habit and persist
 * it as the habit's record for the day. Runs:
 *   - on mount (so the home grid is fresh when the user opens the app)
 *   - on AppState → 'active' (so a long-running session that backgrounds
 *     and returns gets the latest step total without needing a tile tap)
 *
 * Throttled so we don't hammer HealthKit/Health Connect during rapid
 * foreground/background flips: at most one sync per 30s.
 */
export function useStepsBackfill() {
  const { user } = useAuth();
  const { habits } = useHabits();
  const { todayStr } = useTodayDate();
  const lastSyncAtRef = useRef<number>(0);

  useEffect(() => {
    if (!user) return;
    const stepsHabits = habits.filter((h) => h.recordingMode === 'steps');
    if (stepsHabits.length === 0) return;

    const sync = async () => {
      const now = Date.now();
      if (now - lastSyncAtRef.current < 30_000) return;
      lastSyncAtRef.current = now;

      const steps = await getStepsForDay(todayStr);
      if (steps == null) return;

      for (const habit of stepsHabits) {
        const value = computeStepsLevel(steps, habit.stepGoals ?? []);
        const docId = `${habit.id}_${todayStr}`;
        const next: HabitRecord = {
          id: docId,
          habitId: habit.id,
          userId: user.uid,
          date: todayStr,
          value,
          recordedAt: Date.now(),
          source: 'auto',
          steps,
        };
        try {
          await setDoc(doc(db, 'records', docId), next);
        } catch (err) {
          console.error('Steps backfill write failed:', err);
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
