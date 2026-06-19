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
import { useHabitsContext } from '@/contexts/habits-context';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from '@/lib/firebase/firestore';
import { emitError } from '@/lib/error-bus';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
import { deleteAllItems } from '@/lib/firebase/checklist-items';
import { maybeBumpCreativeWriting } from '@/lib/creative-writing';
import { useTodayDate } from '@/hooks/use-today-date';
import type { Note } from '@/types/note';

// Initial page size for the notes list. "Load more" grows the live window in
// PAGE_SIZE increments; "load all" drops the limit entirely.
const PAGE_SIZE = 50;

type NoteUpdates = Partial<
  Pick<
    Note,
    | 'title'
    | 'content'
    | 'tags'
    | 'type'
    | 'description'
    | 'checklist'
    | 'checklistSummary'
    | 'itemsMigrated'
  >
>;

type NotesContextValue = {
  notes: Note[];
  isLoading: boolean;
  isOffline: boolean;
  isLoadingMore: boolean;
  allLoaded: boolean;
  /**
   * True once the window listener has delivered at least one SUCCESSFUL
   * snapshot this session. The orphan-tag GC must gate on this: a listener
   * error leaves `notes` empty with loading finished, and sweeping against
   * an empty set would delete every tag.
   */
  hasLoadedOnce: boolean;
  /** True when the notes listener last errored — blocks the orphan-tag GC. */
  listenerError: boolean;
  loadMore: () => void;
  loadAll: () => void;
  createNote: (title: string, content?: string) => Note | null;
  updateNote: (
    noteId: string,
    updates: NoteUpdates,
    options?: { touch?: boolean },
  ) => Promise<void>;
  togglePinNote: (noteId: string, pinned: boolean) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
};

// Defensive: validate the minimum-required fields before trusting a doc as a
// Note. A blind `as Note` cast would let a corrupt or partially-migrated doc
// through, then crash downstream when consumers accessed missing fields. Bad
// docs are dropped + logged instead of poisoning the list. Shared by every
// notes reader (windowed list, pinned sidecar, single-note, export).
export function toValidNote(id: string, raw: Record<string, unknown> | undefined): Note | null {
  if (
    !raw ||
    typeof raw.userId !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.content !== 'string' ||
    !Array.isArray(raw.tags) ||
    typeof raw.createdAt !== 'number' ||
    typeof raw.updatedAt !== 'number'
  ) {
    // Don't log `raw` — it can contain the full note body (PII).
    console.warn(`useNotes: skipping malformed note doc ${id}`);
    return null;
  }
  return { id, ...raw } as Note;
}

// Merge note lists deduped by id (later lists win on collision). Order is
// irrelevant — the list screen re-sorts (pinned first, then updatedAt desc).
function mergeById(...lists: Note[][]): Note[] {
  const byId = new Map<string, Note>();
  for (const list of lists) {
    for (const n of list) byId.set(n.id, n);
  }
  return [...byId.values()];
}

// True when every field in `updates` already equals the note's current value
// — i.e. the write would change nothing. Lets updateNote skip wasted writes
// (and the re-sort/re-push they trigger on every notes listener).
function isNoOpNoteUpdate(note: Note, updates: NoteUpdates): boolean {
  return Object.entries(updates).every(([key, value]) => {
    const current = (note as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object') {
      return JSON.stringify(current) === JSON.stringify(value);
    }
    return current === value;
  });
}

const NotesContext = createContext<NotesContextValue>({
  notes: [],
  isLoading: true,
  isOffline: false,
  isLoadingMore: false,
  allLoaded: true,
  hasLoadedOnce: false,
  listenerError: false,
  loadMore: () => {},
  loadAll: () => {},
  createNote: () => null,
  updateNote: async () => {},
  togglePinNote: async () => {},
  deleteNote: async () => {},
});

/**
 * Single app-wide notes subscription (windowed list + pinned sidecar) mounted
 * once under the auth gate. Preserves the pagination model and optimistic
 * mutation paths that landed in the earlier refactor.
 *
 * Creative-writing decouple: the bump only needs the user's habits, which we
 * read from HabitsContext (a context read, NOT a second habits listener). This
 * removes the duplicate full-habits subscription the old useNotes() opened —
 * which mattered most on the habits home, where it stacked on the screen's own
 * useHabits(). HabitsProvider must therefore be an ancestor of NotesProvider.
 */
export function NotesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const { habits } = useHabitsContext();
  const { todayStr } = useTodayDate();
  // Stale-closure proof: refs that callbacks read instead of values, so the
  // Creative Writing bump always sees the latest habit list + today's date
  // without bloating the callback's dep array (and thus invalidating its
  // identity every render).
  const habitsRef = useRef(habits);
  habitsRef.current = habits;
  const todayRef = useRef(todayStr);
  todayRef.current = todayStr;
  const notesRef = useRef<Note[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  // Listener error → surface to the user AND hard-block the orphan-tag GC so a
  // failed/empty-on-error snapshot can never be mistaken for "no notes" and
  // wipe every tag. Retry bumps the nonce to re-subscribe.
  const [listenerError, setListenerError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  // null = no limit ("load all"); otherwise the current window size.
  const [pageLimit, setPageLimit] = useState<number | null>(PAGE_SIZE);

  // Keep notesRef in lockstep with state so updateNote can read the
  // pre-patch note synchronously when deciding whether to bump.
  notesRef.current = notes;

  // `notes` is the merge of two realtime listeners: the recency window and the
  // pinned sidecar. Each listener stashes its latest validated docs in a ref,
  // then re-merges so neither clobbers the other. The optimistic setNotes
  // paths below patch the merged result directly and are reconciled by the
  // next snapshot (the listeners re-fire from Firestore's local cache almost
  // immediately after a write).
  const windowDataRef = useRef<Note[]>([]);
  const pinnedDataRef = useRef<Note[]>([]);
  const applyMerge = useCallback(() => {
    setNotes(mergeById(pinnedDataRef.current, windowDataRef.current));
  }, []);

  // Ref mirrors of the paging flags so loadMore/loadAll can guard against
  // re-entrancy (onEndReached can fire several times per drag) without taking
  // hasMore/isLoadingMore as deps and churning their identity.
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);

  // New user (or sign-out): reset paging and drop the prior account's data so
  // a stale page can't leak across accounts during the re-subscribe gap.
  useEffect(() => {
    windowDataRef.current = [];
    pinnedDataRef.current = [];
    hasMoreRef.current = false;
    loadingMoreRef.current = false;
    setNotes([]);
    setHasMore(false);
    setIsLoadingMore(false);
    setIsLoading(true);
    setPageLimit(PAGE_SIZE);
  }, [user]);

  // Windowed realtime listener: the most-recent `pageLimit` notes (or all
  // notes when pageLimit is null). Re-subscribes when the window grows.
  useEffect(() => {
    if (!user) {
      windowDataRef.current = [];
      pinnedDataRef.current = [];
      setNotes([]);
      // Stay "loading" while signed out / auth restoring — see HabitsProvider.
      setIsLoading(true);
      setIsLoadingMore(false);
      setHasMore(false);
      setHasLoadedOnce(false);
      setIsOffline(false);
      return;
    }

    const base = collection(db, 'notes');
    const q =
      pageLimit === null
        ? query(base, where('userId', '==', user.uid), orderBy('updatedAt', 'desc'))
        : query(
            base,
            where('userId', '==', user.uid),
            orderBy('updatedAt', 'desc'),
            limit(pageLimit),
          );

    return subscribeWithOfflineState(
      q,
      (snapshot) => {
        const data: Note[] = [];
        for (const d of snapshot.docs) {
          const n = toValidNote(d.id, d.data());
          if (n) data.push(n);
        }
        windowDataRef.current = data;
        // A full window means there may be more notes beyond it; a short one
        // means we've reached the end. With no limit, everything is loaded.
        const more = pageLimit !== null && snapshot.size >= pageLimit;
        hasMoreRef.current = more;
        setHasMore(more);
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
        applyMerge();
        setIsLoading(false);
        setHasLoadedOnce(true);
        setListenerError(false);
      },
      {
        onError: (error) => {
          console.error('[useNotes] snapshot error:', error);
          loadingMoreRef.current = false;
          setIsLoadingMore(false);
          setIsLoading(false);
          setListenerError(true);
          emitError("Couldn't load your notes. Tap Retry.", () => setRetryNonce((n) => n + 1));
        },
        setOffline: (offline) => {
          setIsOffline(offline);
          if (offline) setIsLoading(false);
        },
      },
    );
  }, [user, pageLimit, applyMerge, retryNonce]);

  // Pinned sidecar: pinned notes are always present regardless of the window,
  // so a pinned note older than the loaded page still floats to the top. Two
  // equality filters (no orderBy) are served by Firestore's auto single-field
  // indexes, so this needs no composite index. Plain onSnapshot so it doesn't
  // contend with the window listener over `isOffline`.
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      where('pinned', '==', true),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const data: Note[] = [];
        for (const d of snapshot.docs) {
          const n = toValidNote(d.id, d.data());
          if (n) data.push(n);
        }
        pinnedDataRef.current = data;
        applyMerge();
      },
      (error) => {
        console.error('[useNotes] pinned snapshot error:', error);
      },
    );
  }, [user, applyMerge]);

  // Grow the live window by one page. Guarded so a burst of onEndReached
  // events only triggers a single fetch.
  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setPageLimit((p) => (p === null ? null : p + PAGE_SIZE));
  }, []);

  // Drop the limit so the listener covers every note — backs the "Search all
  // notes" affordance and, once complete, re-enables the orphan-tag GC.
  const loadAll = useCallback(() => {
    if (!hasMoreRef.current || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setPageLimit(null);
  }, []);

  const createNote = useCallback(
    (title: string, content: string = '') => {
      if (!user) return null;
      if (!requireOnline()) return null;
      const ref = doc(collection(db, 'notes'));
      const now = Date.now();
      const newNote: Note = {
        id: ref.id,
        userId: user.uid,
        title,
        content,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      // Optimistically add to local state so the editor screen finds it immediately
      setNotes((prev) => [newNote, ...prev]);
      // Fire-and-forget Firestore write — surface failures to console so
      // we don't have a phantom-note situation (UI shows it, Firestore
      // doesn't have it) silently in production.
      setDoc(ref, newNote).catch((err) => {
        console.error('createNote: Firestore write failed', err);
        emitError("Couldn't save the new note. Tap Retry.", () => {
          setDoc(ref, newNote).catch((e) => console.error('createNote retry failed', e));
        });
      });
      // Creative Writing auto-bump (fire-and-forget). New notes default to
      // text (no `type` field) → not a checklist → bump-eligible.
      void maybeBumpCreativeWriting({
        habits: habitsRef.current,
        userId: user.uid,
        todayStr: todayRef.current,
        isChecklist: false,
      });
      return newNote;
    },
    [user, requireOnline],
  );

  const updateNote = useCallback(
    async (
      noteId: string,
      updates: NoteUpdates,
      // `touch: false` updates the data WITHOUT bumping updatedAt — used by
      // checklist completion toggles and reorders, so checking a box doesn't
      // jump the note to the top of the recency-sorted list.
      options?: { touch?: boolean },
    ) => {
      if (!user) return;
      const existing = notesRef.current.find((n) => n.id === noteId);
      // Skip writes that change nothing: avoids a wasted Firestore write and
      // the re-sort/re-push it would fan out to every mounted notes listener.
      if (existing && isNoOpNoteUpdate(existing, updates)) return;
      const touch = options?.touch ?? true;
      const now = Date.now();
      // Optimistic local update: apply the patch synchronously before the
      // Firestore write resolves. Without this, callers (especially the
      // text↔checklist toggle) wait for a ~100–200ms network round-trip
      // before the UI reflects the change. The snapshot listener will
      // re-confirm the same data shortly after.
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? ({ ...n, ...updates, ...(touch ? { updatedAt: now } : {}) } as Note)
            : n,
        ),
      );
      const ref = doc(db, 'notes', noteId);
      try {
        await setDoc(
          ref,
          touch ? { ...updates, updatedAt: now } : { ...updates },
          { merge: true },
        );
      } catch (err) {
        // Silent rollback isn't safe (we'd clobber other in-flight edits), so
        // surface the failure with a retry of the same merge write instead of
        // letting the optimistic "saved" state lie.
        console.error('updateNote: Firestore write failed', err);
        emitError("Couldn't save your note changes. Tap Retry.", () => {
          setDoc(ref, touch ? { ...updates, updatedAt: now } : { ...updates }, { merge: true }).catch(
            (e) => console.error('updateNote retry failed', e),
          );
        });
      }
      // Creative Writing auto-bump. The note's checklist status after this
      // patch determines whether it counts — `updates.type` wins if it
      // changed; otherwise we fall back to the existing note's type from
      // the pre-patch snapshot. Pre-existing notes with no type field
      // count as text (default).
      const resultingType = updates.type ?? existing?.type ?? 'text';
      void maybeBumpCreativeWriting({
        habits: habitsRef.current,
        userId: user.uid,
        todayStr: todayRef.current,
        isChecklist: resultingType === 'checklist',
      });
    },
    [user],
  );

  const togglePinNote = useCallback(
    async (noteId: string, pinned: boolean) => {
      if (!user) return;
      if (!requireOnline()) return;
      // Optimistic local update — no updatedAt change (pinning shouldn't bump edit time)
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, pinned, hasBeenPinned: n.hasBeenPinned || pinned } : n,
        ),
      );
      const ref = doc(db, 'notes', noteId);
      const payload: Partial<Note> = { pinned };
      if (pinned) payload.hasBeenPinned = true;
      try {
        await setDoc(ref, payload, { merge: true });
      } catch (err) {
        console.error('togglePinNote: Firestore write failed', err);
      }
    },
    [user, requireOnline],
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!user) return;
      if (!requireOnline()) return;
      try {
        // Items live in the `notes/{id}/items` subcollection, which
        // Firestore does NOT cascade-delete with the parent. Drop them
        // FIRST so a failure leaves the note (and its items) intact for a
        // retry rather than orphaning items under a deleted note. (No-op
        // read for text notes — the subcollection is just empty.)
        await deleteAllItems(noteId, user.uid);
        await deleteDoc(doc(db, 'notes', noteId));
      } catch (err) {
        console.error('deleteNote: Firestore delete failed', err);
      }
    },
    [user, requireOnline],
  );

  const value = useMemo(
    () => ({
      notes,
      isLoading,
      isOffline,
      isLoadingMore,
      allLoaded: !hasMore,
      hasLoadedOnce,
      listenerError,
      loadMore,
      loadAll,
      createNote,
      updateNote,
      togglePinNote,
      deleteNote,
    }),
    [
      notes,
      isLoading,
      isOffline,
      isLoadingMore,
      hasMore,
      hasLoadedOnce,
      listenerError,
      loadMore,
      loadAll,
      createNote,
      updateNote,
      togglePinNote,
      deleteNote,
    ],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotesContext(): NotesContextValue {
  return useContext(NotesContext);
}
