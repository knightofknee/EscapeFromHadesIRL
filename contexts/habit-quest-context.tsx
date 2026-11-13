import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineGuard } from '@/contexts/offline-context';
import { db, collection, query, where, doc, setDoc, deleteDoc } from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
import { emitError } from '@/lib/error-bus';
import type { Habit } from '@/types/habit';
import type { HabitQuest } from '@/types/habit-quest';
import type { QuestLevel } from '@/lib/habit-quest';

export const HABIT_QUESTS_COLLECTION = 'habitQuests';

type HabitQuestContextValue = {
  /** The one running 60-day quest, or null. */
  activeQuest: HabitQuest | null;
  /** Finished 60-day quests, newest first. Badge numbering reads these. */
  pastQuests: HabitQuest[];
  /** The one running Level Two quest, or null. Runs alongside the 60-day quest. */
  activeLevelTwo: HabitQuest | null;
  /** Finished Level Two quests, newest first. */
  pastLevelTwo: HabitQuest[];
  isLoading: boolean;
  /**
   * Start a quest of `level` on `habit`, day 1 = `startDate`. No-op while
   * one of that level is running. With `passed` (the habit's last 60 days
   * already pass), the quest is recorded as finished on the spot and the
   * badge is earned (or upgraded, at level 2).
   */
  startQuest: (habit: Habit, startDate: string, passed?: QuestResult, level?: QuestLevel) => void;
  /** Close out the running quest of `level`: the completed attempt's day 1, its count, and its final strength. */
  finishQuest: (result: QuestResult, level?: QuestLevel) => void;
  /** Drop the running quest of `level` entirely (no history). */
  abandonQuest: (level?: QuestLevel) => void;
  /**
   * The date whose per-day celebration already played from a quest card's
   * check, per level, so the Habits grid does not play it again when it
   * next sees that day recorded (tabs freeze on blur, so it sees it late).
   */
  celebratedDateRef: MutableRefObject<string | null>;
  celebratedLevelTwoDateRef: MutableRefObject<string | null>;
};

export type QuestResult = { attemptStart: string; endDate: string; daysDone: number; strength: number };

const HabitQuestContext = createContext<HabitQuestContextValue>({
  activeQuest: null,
  pastQuests: [],
  activeLevelTwo: null,
  pastLevelTwo: [],
  isLoading: true,
  startQuest: () => {},
  finishQuest: () => {},
  abandonQuest: () => {},
  celebratedDateRef: { current: null },
  celebratedLevelTwoDateRef: { current: null },
});

/**
 * Single app-wide listener on the user's 60-day quests (`habitQuests`). Read
 * by the Quests tab (the quest section) and the Habits grid (holo tile +
 * per-day celebration), so it lives with the other shared providers.
 *
 * Writes are fire-and-forget with an error-bus retry, like records: the
 * listener's local cache reflects them at once, and awaiting the server ack
 * can hang on a spotty connection.
 */
export function HabitQuestProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const [quests, setQuests] = useState<HabitQuest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setQuests([]);
      // Stay "loading" while signed out / auth restoring — see HabitsProvider.
      setIsLoading(true);
      return;
    }
    setIsLoading(true);
    const q = query(collection(db, HABIT_QUESTS_COLLECTION), where('userId', '==', user.uid));
    return subscribeWithOfflineState(
      q,
      (snapshot) => {
        setQuests(snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }) as HabitQuest));
        setIsLoading(false);
      },
      {
        onError: (error) => {
          console.error('[habitQuests] snapshot error:', error);
          setIsLoading(false);
        },
        setOffline: (offline) => {
          if (offline) setIsLoading(false);
        },
      },
    );
  }, [user]);

  const byLevel = useMemo(() => {
    const active = (level: QuestLevel) =>
      quests
        .filter((q) => q.status === 'active' && (q.level ?? 1) === level)
        .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
    const past = (level: QuestLevel) =>
      quests
        .filter((q) => q.status === 'finished' && (q.level ?? 1) === level)
        .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));
    return { active1: active(1), active2: active(2), past1: past(1), past2: past(2) };
  }, [quests]);
  const activeQuest = byLevel.active1;
  const activeLevelTwo = byLevel.active2;
  const pastQuests = byLevel.past1;
  const pastLevelTwo = byLevel.past2;
  const activeOf = useCallback(
    (level: QuestLevel) => (level === 2 ? activeLevelTwo : activeQuest),
    [activeQuest, activeLevelTwo],
  );

  const startQuest = useCallback(
    (habit: Habit, startDate: string, passed?: QuestResult, level: QuestLevel = 1) => {
      if (!user || activeOf(level)) return;
      if (!requireOnline()) return;
      const ref = doc(collection(db, HABIT_QUESTS_COLLECTION));
      const now = Date.now();
      const quest: HabitQuest = {
        id: ref.id,
        userId: user.uid,
        habitId: habit.id,
        habitName: habit.name,
        habitColor: habit.color,
        createdAt: now,
        updatedAt: now,
        ...(level === 2 ? { level: 2 as const } : {}),
        ...(passed
          ? {
              startDate: passed.attemptStart,
              endDate: passed.endDate,
              status: 'finished',
              daysDone: passed.daysDone,
              finalStrength: passed.strength,
              finishedAt: now,
              passedAtStart: true,
            }
          : { startDate, status: 'active' }),
      };
      const write = () =>
        setDoc(ref, quest).catch((e) => {
          console.error('[habitQuests] start failed', e);
          emitError("Couldn't start the quest. Tap Retry.", write);
        });
      write();
    },
    [user, activeOf, requireOnline],
  );

  const finishQuest = useCallback(
    ({ attemptStart, endDate, daysDone, strength }: QuestResult, level: QuestLevel = 1) => {
      const quest = activeOf(level);
      if (!user || !quest) return;
      if (!requireOnline()) return;
      const now = Date.now();
      const ref = doc(db, HABIT_QUESTS_COLLECTION, quest.id);
      const write = () =>
        setDoc(
          ref,
          // startDate becomes the completed attempt's day 1, so history
          // shows the 60 days that actually counted.
          { status: 'finished', startDate: attemptStart, endDate, daysDone, finalStrength: strength, finishedAt: now, updatedAt: now },
          { merge: true },
        ).catch(
          (e) => {
            console.error('[habitQuests] finish failed', e);
            emitError("Couldn't save the quest result. Tap Retry.", write);
          },
        );
      write();
    },
    [user, activeOf, requireOnline],
  );

  const abandonQuest = useCallback((level: QuestLevel = 1) => {
    const quest = activeOf(level);
    if (!user || !quest) return;
    if (!requireOnline()) return;
    const ref = doc(db, HABIT_QUESTS_COLLECTION, quest.id);
    const write = () =>
      deleteDoc(ref).catch((e) => {
        console.error('[habitQuests] abandon failed', e);
        emitError("Couldn't abandon the quest. Tap Retry.", write);
      });
    write();
  }, [user, activeOf, requireOnline]);

  const celebratedDateRef = useRef<string | null>(null);
  const celebratedLevelTwoDateRef = useRef<string | null>(null);
  const value = useMemo(
    () => ({
      activeQuest,
      pastQuests,
      activeLevelTwo,
      pastLevelTwo,
      isLoading,
      startQuest,
      finishQuest,
      abandonQuest,
      celebratedDateRef,
      celebratedLevelTwoDateRef,
    }),
    [activeQuest, pastQuests, activeLevelTwo, pastLevelTwo, isLoading, startQuest, finishQuest, abandonQuest],
  );

  return <HabitQuestContext.Provider value={value}>{children}</HabitQuestContext.Provider>;
}

export function useHabitQuest(): HabitQuestContextValue {
  return useContext(HabitQuestContext);
}
