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
  updateDoc,
  writeBatch,
} from '@/lib/firebase/firestore';
import { arrayRemove } from 'firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
import { emitError } from '@/lib/error-bus';
import { CHORES_COLLECTION, addCompletion, removeCompletion } from '@/lib/chores';
import type { Chore, ChoreReminder } from '@/types/chore';
import { syncChoreReminders } from '@/lib/chore-reminders';

const NO_CHORES: Chore[] = [];

export type ChoreDraft = Pick<Chore, 'kind' | 'name' | 'emoji' | 'frequencyDays' | 'description' | 'dueDate' | 'reminderTime'> &
  Partial<Pick<Chore, 'reminders' | 'memberIds'>>;

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
  /** Bulk delete (clearing finished tasks): one batch write. */
  deleteChores: (ids: string[]) => Promise<boolean>;
  markDone: (id: string, date: string) => Promise<boolean>;
  unmarkDone: (id: string, date: string) => Promise<boolean>;
  /** Replace MY reminders on a chore (others' are untouched). */
  setReminders: (id: string, reminders: ChoreReminder[]) => Promise<boolean>;
  /** Owner only: who the chore is shared with (friend uids; the owner is added). */
  setSharedWith: (id: string, friendUids: string[]) => Promise<boolean>;
  /** A member drops a chore someone shared with them. */
  leaveChore: (id: string) => Promise<boolean>;
};

const ChoresContext = createContext<ChoresContextValue>({
  chores: [],
  isLoading: true,
  isOffline: false,
  createChore: async () => undefined,
  createChores: async () => false,
  updateChore: async () => false,
  deleteChore: async () => false,
  deleteChores: async () => false,
  markDone: async () => false,
  unmarkDone: async () => false,
  setReminders: async () => false,
  setSharedWith: async () => false,
  leaveChore: async () => false,
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
  const [isOffline, setIsOffline] = useState(false);

  // Two listeners: chores I own, and chores friends shared with me (rules
  // let each through on its own branch). The shared list drops my own, so
  // the two never overlap.
  const [own, setOwn] = useState<Chore[] | null>(null);
  const [shared, setShared] = useState<Chore[] | null>(null);
  useEffect(() => {
    if (!user) {
      setOwn(null);
      setShared(null);
      setIsOffline(false);
      return;
    }
    setOwn(null);
    setShared(null);
    const toChores = (snapshot: { docs: { id: string; data: () => unknown }[] }) =>
      snapshot.docs.map((d) => {
        const data = d.data() as Omit<Chore, 'id'>;
        return { ...data, id: d.id, completions: data.completions ?? [] };
      });
    const unsubOwn = subscribeWithOfflineState(
      query(collection(db, CHORES_COLLECTION), where('userId', '==', user.uid)),
      (snapshot: { docs: { id: string; data: () => unknown }[] }) => setOwn(toChores(snapshot)),
      {
        onError: (error) => {
          console.error('[chores] snapshot error:', error);
          setOwn((prev) => prev ?? []);
        },
        setOffline: (offline) => {
          setIsOffline(offline);
          if (offline) setOwn((prev) => prev ?? []);
        },
      },
    );
    const unsubShared = subscribeWithOfflineState(
      query(collection(db, CHORES_COLLECTION), where('memberIds', 'array-contains', user.uid)),
      (snapshot: { docs: { id: string; data: () => unknown }[] }) =>
        setShared(toChores(snapshot).filter((c) => c.userId !== user.uid)),
      {
        onError: (error) => {
          console.error('[chores] shared snapshot error:', error);
          setShared((prev) => prev ?? []);
        },
        setOffline: (offline) => {
          if (offline) setShared((prev) => prev ?? []);
        },
      },
    );
    return () => {
      unsubOwn();
      unsubShared();
    };
  }, [user]);

  // Stay "loading" while signed out / auth restoring (see HabitsProvider),
  // and until both listeners have delivered.
  const isLoading = !user || own === null || shared === null;
  const chores = useMemo(() => (own && shared ? [...own, ...shared] : NO_CHORES), [own, shared]);

  // Completion writes read-modify-write the history array; read the latest
  // snapshot through a ref so back-to-back taps don't build on a stale copy.
  const choresRef = useRef(chores);
  useEffect(() => {
    choresRef.current = chores;
  }, [chores]);

  // Keep this phone's reminders in step with the synced list (set, moved,
  // done, deleted, or set on another phone). Personal chores only: a shared
  // chore's reminders come from the server, which knows whether a friend
  // already did it. Signed out → none. Serialized so overlapping snapshots
  // can't schedule duplicates.
  const reminderSync = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (user && isLoading) return;
    const list = user ? chores : [];
    reminderSync.current = reminderSync.current.then(() => syncChoreReminders(list, user?.uid ?? ''));
  }, [chores, isLoading, user]);

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

  const deleteChores = useCallback(
    (ids: string[]) =>
      write('bulk delete', async () => {
        // Firestore caps a batch at 500 writes.
        for (let i = 0; i < ids.length; i += 450) {
          const batch = writeBatch(db);
          for (const id of ids.slice(i, i + 450)) batch.delete(doc(db, CHORES_COLLECTION, id));
          await batch.commit();
        }
      }),
    [write],
  );

  const setCompletions = useCallback(
    (id: string, change: (completions: string[]) => string[], label: string) => {
      const current = choresRef.current.find((c) => c.id === id);
      if (!current) return Promise.resolve(false);
      const completions = change(current.completions);
      // Reflect immediately so a second tap reads this result.
      choresRef.current = choresRef.current.map((c) => (c.id === id ? { ...c, completions } : c));
      // Who logged the newest day, so friends see who did it.
      const doneBy = completions[0] && completions[0] !== current.completions[0] ? { lastDoneBy: user?.uid } : {};
      return write(label, () =>
        setDoc(
          doc(db, CHORES_COLLECTION, id),
          stripUndefined({ completions, ...doneBy, updatedAt: Date.now() }),
          { merge: true },
        ),
      );
    },
    [write, user],
  );

  const markDone = useCallback(
    (id: string, date: string) => setCompletions(id, (c) => addCompletion(c, date), 'mark done'),
    [setCompletions],
  );

  const unmarkDone = useCallback(
    (id: string, date: string) => setCompletions(id, (c) => removeCompletion(c, date), 'undo'),
    [setCompletions],
  );

  const setReminders = useCallback(
    (id: string, reminders: ChoreReminder[]) =>
      write('reminders', () =>
        // A field path, so a friend's reminders on the same chore are untouched.
        // An empty list (not a delete) also retires the legacy reminderTime.
        updateDoc(doc(db, CHORES_COLLECTION, id), { [`reminders.${user!.uid}`]: reminders, updatedAt: Date.now() }),
      ),
    [write, user],
  );

  const setSharedWith = useCallback(
    (id: string, friendUids: string[]) =>
      write('share', () =>
        updateDoc(doc(db, CHORES_COLLECTION, id), {
          memberIds: friendUids.length ? [user!.uid, ...friendUids.filter((f) => f !== user!.uid)] : [],
          updatedAt: Date.now(),
        }),
      ),
    [write, user],
  );

  const leaveChore = useCallback(
    (id: string) =>
      write('leave', () =>
        updateDoc(doc(db, CHORES_COLLECTION, id), { memberIds: arrayRemove(user!.uid), updatedAt: Date.now() }),
      ),
    [write, user],
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
      deleteChores,
      markDone,
      unmarkDone,
      setReminders,
      setSharedWith,
      leaveChore,
    }),
    [
      chores,
      isLoading,
      isOffline,
      createChore,
      createChores,
      updateChore,
      deleteChore,
      deleteChores,
      markDone,
      unmarkDone,
      setReminders,
      setSharedWith,
      leaveChore,
    ],
  );

  return <ChoresContext.Provider value={value}>{children}</ChoresContext.Provider>;
}

export function useChores(): ChoresContextValue {
  return useContext(ChoresContext);
}
