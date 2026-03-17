import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
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
import type { Note } from '@/types/note';

export function useNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc'),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Note);
      setNotes(data);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const createNote = useCallback(
    async (title: string, content: string = '') => {
      if (!user) return;
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
      await setDoc(ref, newNote);
      return newNote;
    },
    [user],
  );

  const updateNote = useCallback(
    async (noteId: string, updates: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => {
      if (!user) return;
      const ref = doc(db, 'notes', noteId);
      await setDoc(ref, { ...updates, updatedAt: Date.now() }, { merge: true });
    },
    [user],
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'notes', noteId));
    },
    [user],
  );

  return { notes, isLoading, createNote, updateNote, deleteNote };
}
