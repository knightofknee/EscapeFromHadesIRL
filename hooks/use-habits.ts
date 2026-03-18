import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { deleteField } from 'firebase/firestore';
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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Habit);
      setHabits(data);
      setIsLoading(false);
    });

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
      await setDoc(ref, newHabit);
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
