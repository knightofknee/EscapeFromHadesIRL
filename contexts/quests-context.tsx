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
import type { Quest } from '@/types/quest';

type QuestsContextValue = {
  quests: Quest[];
  isLoading: boolean;
  isOffline: boolean;
  createQuest: (
    quest: Omit<Quest, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'activatedAt'>,
  ) => Promise<Quest | undefined>;
  updateQuest: (questId: string, updates: Partial<Quest>) => Promise<void>;
  pauseQuest: (questId: string) => Promise<void>;
  deleteQuest: (questId: string) => Promise<void>;
};

const QuestsContext = createContext<QuestsContextValue>({
  quests: [],
  isLoading: true,
  isOffline: false,
  createQuest: async () => undefined,
  updateQuest: async () => {},
  pauseQuest: async () => {},
  deleteQuest: async () => {},
});

/**
 * Single app-wide subscription to the signed-in user's active quests. Mounted
 * once under the auth gate; the quests list + detail screens both read this
 * one listener instead of opening their own. Return shape mirrors the old
 * useQuests() exactly.
 */
export function QuestsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!user) {
      setQuests([]);
      setIsLoading(false);
      setIsOffline(false);
      return;
    }

    const q = query(
      collection(db, 'quests'),
      where('userId', '==', user.uid),
      where('status', '==', 'active'),
      orderBy('activatedAt'),
    );

    return subscribeWithOfflineState(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }) as Quest);
        setQuests(data);
        setIsLoading(false);
      },
      {
        onError: (error) => {
          console.error('[useQuests] snapshot error:', error);
          setIsLoading(false);
        },
        setOffline: setIsOffline,
      },
    );
  }, [user]);

  const createQuest = useCallback(
    async (quest: Omit<Quest, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'activatedAt'>) => {
      if (!user) return;
      if (!requireOnline()) return;
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
    [user, requireOnline],
  );

  const updateQuest = useCallback(
    async (questId: string, updates: Partial<Quest>) => {
      if (!user) return;
      if (!requireOnline()) return;
      const ref = doc(db, 'quests', questId);
      const firestoreUpdates: Record<string, any> = { updatedAt: Date.now() };
      for (const [key, value] of Object.entries(updates)) {
        firestoreUpdates[key] = value === undefined ? deleteField() : value;
      }
      await setDoc(ref, firestoreUpdates, { merge: true });
    },
    [user, requireOnline],
  );

  const pauseQuest = useCallback(
    async (questId: string) => {
      await updateQuest(questId, { status: 'paused' });
    },
    [updateQuest],
  );

  const deleteQuest = useCallback(
    async (questId: string) => {
      if (!user) return;
      if (!requireOnline()) return;
      await deleteDoc(doc(db, 'quests', questId));
    },
    [user, requireOnline],
  );

  const value = useMemo(
    () => ({
      quests,
      isLoading,
      isOffline,
      createQuest,
      updateQuest,
      pauseQuest,
      deleteQuest,
    }),
    [quests, isLoading, isOffline, createQuest, updateQuest, pauseQuest, deleteQuest],
  );

  return <QuestsContext.Provider value={value}>{children}</QuestsContext.Provider>;
}

export function useQuestsContext(): QuestsContextValue {
  return useContext(QuestsContext);
}
