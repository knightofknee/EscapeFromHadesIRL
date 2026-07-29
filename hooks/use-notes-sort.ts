import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SORT_KEY = '@notesSort';

/** 'updated' = last edited first (default); 'created' = newest created first. */
export type NotesSort = 'updated' | 'created';

// Module-global + listeners (same pattern as use-home-screen) so the notes
// provider (which orders the Firestore window query by this) and the list
// screen (which owns the toggle) stay in sync without a new context.
let globalSort: NotesSort = 'updated';
let listeners: ((s: NotesSort) => void)[] = [];

function notify(s: NotesSort) {
  globalSort = s;
  listeners.forEach((l) => l(s));
}

export function useNotesSort() {
  const [sort, setLocal] = useState<NotesSort>(globalSort);

  useEffect(() => {
    AsyncStorage.getItem(SORT_KEY).then((value) => {
      if (value === 'updated' || value === 'created') notify(value);
    });
    const listener = (s: NotesSort) => setLocal(s);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const setNotesSort = useCallback((value: NotesSort) => {
    notify(value);
    AsyncStorage.setItem(SORT_KEY, value);
  }, []);

  return { notesSort: sort, setNotesSort };
}
