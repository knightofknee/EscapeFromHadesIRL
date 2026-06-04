import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineGuard } from '@/contexts/offline-context';
import { deleteField } from 'firebase/firestore';
import { stripUndefined } from '@/lib/firebase/clean';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
} from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
import type { Habit } from '@/types/habit';

type HabitsContextValue = {
  habits: Habit[];
  isLoading: boolean;
  isOffline: boolean;
  createHabit: (
    habit: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ) => Promise<Habit | undefined>;
  updateHabit: (habitId: string, updates: Partial<Habit>) => Promise<void>;
  archiveHabit: (habitId: string) => Promise<void>;
  reviveHabit: (habitId: string) => Promise<void>;
  deleteHabit: (habitId: string) => Promise<void>;
};

const HabitsContext = createContext<HabitsContextValue>({
  habits: [],
  isLoading: true,
  isOffline: false,
  createHabit: async () => undefined,
  updateHabit: async () => {},
  archiveHabit: async () => {},
  reviveHabit: async () => {},
  deleteHabit: async () => {},
});

/**
 * Single app-wide subscription to the signed-in user's active habits, mounted
 * once under the auth gate. Tabs stay mounted once visited, so before this
 * provider every screen calling useHabits() held its own live listener (the
 * habits home held two — one direct, one via useNotes). Now they all read this
 * one. Return shape mirrors the old useHabits() exactly so call sites are
 * unchanged.
 */
export function HabitsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!user) {
      setHabits([]);
      setIsLoading(false);
      setIsOffline(false);
      return;
    }

    const q = query(
      collection(db, 'habits'),
      where('userId', '==', user.uid),
      where('isArchived', '==', false),
      orderBy('position.row'),
      orderBy('position.col'),
    );

    return subscribeWithOfflineState(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d: any) => {
          const raw = { id: d.id, ...d.data() } as Habit;
          // Migrate old string-based tileSize ('1x1', '2x2', etc.) to numeric
          if (typeof raw.tileSize === 'string') {
            const s = raw.tileSize as string;
            if (s === '2x2') raw.tileSize = 4;
            else if (s === '2x1' || s === '1x2') raw.tileSize = 2;
            else raw.tileSize = 1;
          }
          return raw;
        });
        setHabits(data);
        setIsLoading(false);
      },
      {
        onError: (error) => {
          console.error('[useHabits] snapshot error:', error);
          setIsLoading(false);
        },
        setOffline: setIsOffline,
      },
    );
  }, [user]);

  const createHabit = useCallback(
    async (habit: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
      if (!user) return;
      if (!requireOnline()) return;
      const ref = doc(collection(db, 'habits'));
      const now = Date.now();
      const newHabit: Habit = {
        ...habit,
        id: ref.id,
        userId: user.uid,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(ref, stripUndefined(newHabit));
      return newHabit;
    },
    [user, requireOnline],
  );

  const updateHabit = useCallback(
    async (habitId: string, updates: Partial<Habit>) => {
      if (!user) return;
      if (!requireOnline()) return;
      const ref = doc(db, 'habits', habitId);
      // Replace undefined values with deleteField() so merge: true actually removes them
      const firestoreUpdates: Record<string, any> = { updatedAt: Date.now() };
      for (const [key, value] of Object.entries(updates)) {
        firestoreUpdates[key] = value === undefined ? deleteField() : value;
      }
      await setDoc(ref, firestoreUpdates, { merge: true });
    },
    [user, requireOnline],
  );

  const archiveHabit = useCallback(
    async (habitId: string) => {
      if (!user) return;
      await updateHabit(habitId, { isArchived: true });
    },
    [user, updateHabit],
  );

  const deleteHabit = useCallback(
    async (habitId: string) => {
      if (!user) return;
      if (!requireOnline()) return;
      await deleteDoc(doc(db, 'habits', habitId));
    },
    [user, requireOnline],
  );

  const reviveHabit = useCallback(
    async (habitId: string) => {
      if (!user) return;
      // Place revived habit at the end
      const maxRow = habits.reduce((max, h) => Math.max(max, h.position.row), -1);
      await updateHabit(habitId, { isArchived: false, position: { row: maxRow + 1, col: 0 } });
    },
    [user, habits, updateHabit],
  );

  const value = useMemo(
    () => ({
      habits,
      isLoading,
      isOffline,
      createHabit,
      updateHabit,
      archiveHabit,
      reviveHabit,
      deleteHabit,
    }),
    [habits, isLoading, isOffline, createHabit, updateHabit, archiveHabit, reviveHabit, deleteHabit],
  );

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabitsContext(): HabitsContextValue {
  return useContext(HabitsContext);
}
