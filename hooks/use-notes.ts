import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  db,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  doc,
} from '@/lib/firebase/firestore';
import { useNotesContext, toValidNote } from '@/contexts/notes-context';
import type { Note } from '@/types/note';

/**
 * Notes list + pagination + mutations. Backed by the app-wide NotesProvider
 * (one windowed listener + one pinned sidecar) — see contexts/notes-context.tsx.
 * Return shape (incl. loadMore/loadAll/allLoaded/isLoadingMore and
 * updateNote(id, updates, {touch})) is unchanged so call sites don't change.
 */
export function useNotes() {
  return useNotesContext();
}

/**
 * Single-note realtime subscription, resolved by id directly from Firestore
 * rather than from the (paginated) notes list — so the editor opens any note
 * correctly whether or not it falls in the loaded window. Firestore applies
 * local writes to its cache synchronously, so this reflects edits effectively
 * optimistically.
 */
export function useNote(noteId: string | undefined) {
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!noteId) {
      setNote(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const ref = doc(db, 'notes', noteId);
    return onSnapshot(
      ref,
      (snap) => {
        setNote(snap.exists() ? toValidNote(snap.id, snap.data()) : null);
        setIsLoading(false);
      },
      (error) => {
        console.error('[useNote] snapshot error:', error);
        setIsLoading(false);
      },
    );
  }, [noteId]);

  return { note, isLoading };
}

/**
 * One-time fetch of ALL of the user's notes (not a live subscription). For
 * export, which inherently needs every note — a single full read is the
 * right cost there, whereas the list is paginated.
 */
export function useAllNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const q = query(
          collection(db, 'notes'),
          where('userId', '==', user.uid),
          orderBy('updatedAt', 'desc'),
        );
        const snapshot = await getDocs(q);
        if (cancelled) return;
        const data: Note[] = [];
        for (const d of snapshot.docs) {
          const n = toValidNote(d.id, d.data());
          if (n) data.push(n);
        }
        setNotes(data);
      } catch (err) {
        if (!cancelled) console.error('[useAllNotes] fetch failed', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { notes, isLoading };
}
