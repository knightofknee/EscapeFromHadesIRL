import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineGuard } from '@/contexts/offline-context';
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
import { maybeBumpCreativeWriting } from '@/lib/creative-writing';
import { useHabits } from '@/hooks/use-habits';
import { useTodayDate } from '@/hooks/use-today-date';
import type { Note } from '@/types/note';

export function useNotes() {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const { habits } = useHabits();
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

  // Keep notesRef in lockstep with state so updateNote can read the
  // pre-patch note synchronously when deciding whether to bump.
  notesRef.current = notes;

  useEffect(() => {
    if (!user) {
      setNotes([]);
      setIsLoading(false);
      setIsOffline(false);
      return;
    }

    const q = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
    );

    return subscribeWithOfflineState(
      q,
      (snapshot) => {
        // Defensive: validate the minimum-required fields before trusting
        // the doc as a Note. A blind `as Note` cast (the previous code)
        // would let a corrupt or partially-migrated doc through, then
        // crash downstream when consumers accessed missing fields. Bad
        // docs are dropped + logged instead of poisoning the list.
        const data: Note[] = [];
        for (const d of snapshot.docs) {
          const raw = d.data() as Record<string, unknown>;
          if (
            typeof raw.userId !== 'string' ||
            typeof raw.title !== 'string' ||
            typeof raw.content !== 'string' ||
            !Array.isArray(raw.tags) ||
            typeof raw.createdAt !== 'number' ||
            typeof raw.updatedAt !== 'number'
          ) {
            console.warn(`useNotes: skipping malformed note doc ${d.id}`, raw);
            continue;
          }
          data.push({ id: d.id, ...raw } as Note);
        }
        setNotes(data);
        setIsLoading(false);
      },
      {
        onError: (error) => {
          console.error('[useNotes] snapshot error:', error);
          setIsLoading(false);
        },
        setOffline: setIsOffline,
      },
    );
  }, [user]);

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
      updates: Partial<
        Pick<Note, 'title' | 'content' | 'tags' | 'type' | 'description' | 'checklist'>
      >,
    ) => {
      if (!user) return;
      const now = Date.now();
      // Optimistic local update: apply the patch synchronously before the
      // Firestore write resolves. Without this, callers (especially the
      // text↔checklist toggle) wait for a ~100–200ms network round-trip
      // before the UI reflects the change. The snapshot listener will
      // re-confirm the same data shortly after.
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? ({ ...n, ...updates, updatedAt: now } as Note) : n,
        ),
      );
      const ref = doc(db, 'notes', noteId);
      try {
        await setDoc(ref, { ...updates, updatedAt: now }, { merge: true });
      } catch (err) {
        // Silent rollback isn't safe (we'd clobber other in-flight
        // edits), but we should at least log so production failures
        // are visible. UI is already optimistic — user sees success.
        console.error('updateNote: Firestore write failed', err);
      }
      // Creative Writing auto-bump. The note's checklist status after this
      // patch determines whether it counts — `updates.type` wins if it
      // changed; otherwise we fall back to the existing note's type from
      // the pre-patch snapshot. Pre-existing notes with no type field
      // count as text (default).
      const existing = notesRef.current.find((n) => n.id === noteId);
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
        await deleteDoc(doc(db, 'notes', noteId));
      } catch (err) {
        console.error('deleteNote: Firestore delete failed', err);
      }
    },
    [user, requireOnline],
  );

  return { notes, isLoading, isOffline, createNote, updateNote, togglePinNote, deleteNote };
}
