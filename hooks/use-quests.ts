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
import type { Quest } from '@/types/quest';

export function useQuests() {
  const { user } = useAuth();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setQuests([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'quests'),
      where('userId', '==', user.uid),
      where('status', '==', 'active'),
      orderBy('activatedAt'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Quest);
        setQuests(data);
        setIsLoading(false);
      },
      (error) => {
        console.error('[useQuests] snapshot error:', error);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [user]);

  const createQuest = useCallback(
    async (quest: Omit<Quest, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'activatedAt'>) => {
      if (!user) return;
      const ref = doc(collection(db, 'quests'));
      const now = Date.now();
      const newQuest: Quest = {
        ...quest,
        id: ref.id,
        userId: user.uid,
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      await setDoc(ref, stripUndefined(newQuest));
      return newQuest;
    },
    [user],
  );

  const updateQuest = useCallback(
    async (questId: string, updates: Partial<Quest>) => {
      if (!user) return;
      const ref = doc(db, 'quests', questId);
      const firestoreUpdates: Record<string, any> = { updatedAt: Date.now() };
      for (const [key, value] of Object.entries(updates)) {
        firestoreUpdates[key] = value === undefined ? deleteField() : value;
      }
      await setDoc(ref, firestoreUpdates, { merge: true });
    },
    [user],
  );

  const pauseQuest = useCallback(
    async (questId: string) => updateQuest(questId, { status: 'paused' }),
    [updateQuest],
  );

  const deleteQuest = useCallback(
    async (questId: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'quests', questId));
    },
    [user],
  );

  return { quests, isLoading, createQuest, updateQuest, pauseQuest, deleteQuest };
}
