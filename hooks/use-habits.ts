import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { deleteField } from 'firebase/firestore';
import { stripUndefined } from '@/lib/firebase/clean';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from '@/lib/firebase/firestore';
import type { Habit } from '@/types/habit';

export function useHabits() {
  const { user } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHabits([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'habits'),
      where('userId', '==', user.uid),
      where('isArchived', '==', false),
      orderBy('position.row'),
      orderBy('position.col'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => {
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
        console.log('[useHabits] loaded', data.length, 'habits');
        setHabits(data);
        setIsLoading(false);
      },
      (error) => {
        console.error('[useHabits] snapshot error:', error);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [user]);

  const createHabit = useCallback(
    async (habit: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
      if (!user) return;
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
    [user],
  );

  const updateHabit = useCallback(
    async (habitId: string, updates: Partial<Habit>) => {
      if (!user) return;
      const ref = doc(db, 'habits', habitId);
      // Replace undefined values with deleteField() so merge: true actually removes them
      const firestoreUpdates: Record<string, any> = { updatedAt: Date.now() };
      for (const [key, value] of Object.entries(updates)) {
        firestoreUpdates[key] = value === undefined ? deleteField() : value;
      }
      await setDoc(ref, firestoreUpdates, { merge: true });
    },
    [user],
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
      await deleteDoc(doc(db, 'habits', habitId));
    },
    [user],
  );

  return { habits, isLoading, createHabit, updateHabit, archiveHabit, deleteHabit };
}
