import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, getDoc } from '@/lib/firebase/firestore';
import {
  discardTimer,
  onMeditationSweepRequested,
  settleCompletedTimer,
} from '@/lib/meditation-completion';
import { getTodayString } from '@/lib/date-utils';
import { dismissDeliveredMeditationAlarms } from '@/lib/meditation-notifications';
import {
  computeRemainingSec,
  listAllTimerStates,
} from '@/lib/meditation-timer-storage';
import type { Habit } from '@/types/habit';

/**
 * App-wide settlement of meditation timers that finished while nobody was
 * watching. Renders nothing; mounted once at the root, under AuthProvider.
 *
 * The timer modal is only mounted while that habit's sheet is open, and the
 * common case is the opposite: start a timer, put the phone down, get the
 * notification, come back later. Without this, nothing logged the session,
 * cancelled the Live Activity, or cleared the persisted slot until the user
 * happened to reopen that exact habit's sheet.
 *
 * This is the ONLY writer of timer-completed sessions — the modal just
 * reacts and calls requestMeditationSweep(). A record write replaces the
 * whole day's `sessions`, and the modal only holds the record for the day it
 * is showing, which is not always the day a finishing run belongs to (a run
 * crossing midnight, or a sheet opened on a past date). Settlement instead
 * reads the run's own day's record directly from Firestore
 * (lib/meditation-completion), so it needs no listener state and can't be
 * fooled by an empty or errored records snapshot.
 *
 * Sweeps run on sign-in, on every foreground, on request from the modal, and
 * on a timeout armed for the next known end time (a session finishing while
 * the app is open with its sheet closed fires no AppState event).
 *
 * A still-RUNNING timer is never touched here, whatever day it started —
 * a run begun at 11:50pm keeps its alarm and finishes normally after
 * midnight, logging to its start day. Only a PAUSED slot from a previous day
 * is discarded (the day-rollover "start each day fresh" rule).
 */
export function MeditationAlarmWatcher() {
  const { user } = useAuth();

  // ms timestamp of the soonest still-running end, so we can come back for it
  // without polling.
  const [nextDueAt, setNextDueAt] = useState<number | null>(null);

  // Serialize sweeps: a foreground event, a modal request, and the due-time
  // timeout can land together; settlement is idempotent but there's no point
  // running the same scan three times at once.
  const sweeping = useRef(false);

  const sweep = useCallback(async (uid: string) => {
    if (sweeping.current) return;
    sweeping.current = true;
    try {
      // The user is looking at the app now — clear delivered alarm banners
      // from the tray. Independent of the slot scan, so don't serialize it.
      // (Removes the entry only; a sound already playing can't be stopped on
      // either platform, which is why alarm.wav is short.)
      void dismissDeliveredMeditationAlarms();

      const states = await listAllTimerStates();
      const todayStr = getTodayString();

      let soonest: number | null = null;
      let deferred = false;
      for (const state of states) {
        if (state.startedAt != null) {
          if (computeRemainingSec(state, Date.now()) === 0) {
            // Finished. Look the habit up directly — the habits context
            // excludes archived habits, and a session completed before the
            // habit was archived still belongs in its history.
            let habit: Habit | null = null;
            try {
              const snap = await getDoc(doc(db, 'habits', state.habitId));
              const data = snap.data();
              if (data && data.userId === uid) habit = { id: snap.id, ...data } as Habit;
            } catch {
              // Offline with nothing cached — leave the slot for a later sweep.
              deferred = true;
              continue;
            }
            if (!habit) {
              // Habit deleted (or another account's leftover) — nowhere to
              // log the session; just take down what it left behind.
              await discardTimer(state);
              continue;
            }
            const settled = await settleCompletedTimer(state, habit, uid);
            if (!settled) deferred = true;
          } else {
            // Still running — schedule a comeback for its end. Never discard,
            // even when it started yesterday: cross-midnight runs finish
            // normally and log to their start day.
            const dueAt = state.startedAt + state.remainingAtStart * 1000;
            if (soonest == null || dueAt < soonest) soonest = dueAt;
          }
        } else if (state.date < todayStr) {
          // Paused and abandoned on a previous day. Nothing to log — clear it
          // so every day starts fresh.
          await discardTimer(state);
        }
      }
      // A deferred settle (offline read/write) has no natural wake-up signal
      // when connectivity returns, so ride the due-time timeout: check again
      // in 30s until it lands. The scan is a handful of AsyncStorage keys.
      if (deferred) {
        const retryAt = Date.now() + 30_000;
        if (soonest == null || retryAt < soonest) soonest = retryAt;
      }
      setNextDueAt(soonest);
    } finally {
      sweeping.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    void sweep(uid);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sweep(uid);
    });
    const unsubscribe = onMeditationSweepRequested(() => void sweep(uid));
    return () => {
      sub.remove();
      unsubscribe();
    };
  }, [user, sweep]);

  // Come back exactly when the next running timer is due. setTimeout doesn't
  // fire while the app is suspended, which is fine: the foreground sweep
  // covers that case; this one covers app-open-with-sheet-closed, which has
  // no foreground event at all.
  useEffect(() => {
    if (!user || nextDueAt == null) return;
    const uid = user.uid;
    const id = setTimeout(() => void sweep(uid), Math.max(0, nextDueAt - Date.now()) + 250);
    return () => clearTimeout(id);
  }, [user, nextDueAt, sweep]);

  return null;
}
