import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineGuard } from '@/contexts/offline-context';
import { stripUndefined } from '@/lib/firebase/clean';
import {
  db,
  collection,
  query,
  where,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
import { emitError } from '@/lib/error-bus';
import { CHORES_COLLECTION, addCompletion, removeCompletion } from '@/lib/chores';
import type { Chore } from '@/types/chore';

export type ChoreDraft = Pick<Chore, 'name' | 'emoji' | 'frequencyDays'>;

type ChoresContextValue = {
  chores: Chore[];
  isLoading: boolean;
  isOffline: boolean;
  /** Resolves the new chore, or undefined when blocked/failed. */
  createChore: (draft: ChoreDraft) => Promise<Chore | undefined>;
  /** Bulk add (starter picker): one batch write. Resolves false on failure. */
  createChores: (drafts: ChoreDraft[]) => Promise<boolean>;
  updateChore: (id: string, updates: Partial<ChoreDraft>) => Promise<boolean>;
  deleteChore: (id: string) => Promise<boolean>;
  markDone: (id: string, date: string) => Promise<boolean>;
  unmarkDone: (id: string, date: string) => Promise<boolean>;
};

const ChoresContext = createContext<ChoresContextValue>({
  chores: [],
  isLoading: true,
  isOffline: false,
  createChore: async () => undefined,
  createChores: async () => false,
  updateChore: async () => false,
  deleteChore: async () => false,
  markDone: async () => false,
  unmarkDone: async () => false,
});

/**
 * Single app-wide listener for the user's chores (small docs, the whole set
 * is held). Mounted once under the auth gate with the other providers. Every
 * write goes through requireOnline (alerts and returns false offline) and
 * reports failures on the error bus instead of throwing at the caller.
 */
export function ChoresProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const [chores, setChores] = useState<Chore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  // Completion writes read-modify-write the history array; read the latest
  // snapshot through a ref so back-to-back taps don't build on a stale copy.
  const choresRef = useRef(chores);
  useEffect(() => {
    choresRef.current = chores;
  }, [chores]);

  useEffect(() => {
    if (!user) {
      setChores([]);
      // Stay "loading" while signed out / auth restoring — see HabitsProvider.
      setIsLoading(true);
      setIsOffline(false);
      return;
    }
    setIsLoading(true);
    const q = query(collection(db, CHORES_COLLECTION), where('userId', '==', user.uid));
    return subscribeWithOfflineState(
      q,
      (snapshot: { docs: { id: string; data: () => unknown }[] }) => {
        setChores(
          snapshot.docs.map((d) => {
            const data = d.data() as Omit<Chore, 'id'>;
            return { ...data, id: d.id, completions: data.completions ?? [] };
          }),
        );
        setIsLoading(false);
      },
      {
        onError: (error) => {
          console.error('[chores] snapshot error:', error);
          setIsLoading(false);
        },
        setOffline: (offline) => {
          setIsOffline(offline);
          if (offline) setIsLoading(false);
        },
      },
    );
  }, [user]);

  const write = useCallback(
    async (label: string, op: () => Promise<void>): Promise<boolean> => {
      if (!user || !requireOnline()) return false;
      try {
        await op();
        return true;
      } catch (e) {
        console.error(`[chores] ${label} failed:`, e);
        emitError(`Couldn't save that chore change.`, () => {
          void op().catch(() => {});
        });
        return false;
      }
    },
    [user, requireOnline],
  );

  const buildChore = useCallback(
    (draft: ChoreDraft, id: string): Chore => {
      const now = Date.now();
      return {
        ...draft,
        id,
        userId: user!.uid,
        completions: [],
        createdAt: now,
        updatedAt: now,
      };
    },
    [user],
  );

  const createChore = useCallback(
    async (draft: ChoreDraft) => {
      if (!user) return undefined;
      const ref = doc(collection(db, CHORES_COLLECTION));
      const chore = buildChore(draft, ref.id);
      const ok = await write('create', () => setDoc(ref, stripUndefined(chore)));
      return ok ? chore : undefined;
    },
    [user, write, buildChore],
  );

  const createChores = useCallback(
    async (drafts: ChoreDraft[]) => {
      if (!user || drafts.length === 0) return false;
      return write('bulk create', async () => {
        const batch = writeBatch(db);
        for (const draft of drafts) {
          const ref = doc(collection(db, CHORES_COLLECTION));
          batch.set(ref, stripUndefined(buildChore(draft, ref.id)));
        }
        await batch.commit();
      });
    },
    [user, write, buildChore],
  );

  const updateChore = useCallback(
    (id: string, updates: Partial<ChoreDraft>) =>
      write('update', () =>
        setDoc(doc(db, CHORES_COLLECTION, id), { ...stripUndefined(updates), updatedAt: Date.now() }, { merge: true }),
      ),
    [write],
  );

  const deleteChore = useCallback(
    (id: string) => write('delete', () => deleteDoc(doc(db, CHORES_COLLECTION, id))),
    [write],
  );

  const setCompletions = useCallback(
    (id: string, change: (completions: string[]) => string[], label: string) => {
      const current = choresRef.current.find((c) => c.id === id);
      if (!current) return Promise.resolve(false);
      const completions = change(current.completions);
      // Reflect immediately so a second tap reads this result.
      choresRef.current = choresRef.current.map((c) => (c.id === id ? { ...c, completions } : c));
      return write(label, () =>
        setDoc(doc(db, CHORES_COLLECTION, id), { completions, updatedAt: Date.now() }, { merge: true }),
      );
    },
    [write],
  );

  const markDone = useCallback(
    (id: string, date: string) => setCompletions(id, (c) => addCompletion(c, date), 'mark done'),
    [setCompletions],
  );

  const unmarkDone = useCallback(
    (id: string, date: string) => setCompletions(id, (c) => removeCompletion(c, date), 'undo'),
    [setCompletions],
  );

  const value = useMemo(
    () => ({
      chores,
      isLoading,
      isOffline,
      createChore,
      createChores,
      updateChore,
      deleteChore,
      markDone,
      unmarkDone,
    }),
    [chores, isLoading, isOffline, createChore, createChores, updateChore, deleteChore, markDone, unmarkDone],
  );

  return <ChoresContext.Provider value={value}>{children}</ChoresContext.Provider>;
}

export function useChores(): ChoresContextValue {
  return useContext(ChoresContext);
}
