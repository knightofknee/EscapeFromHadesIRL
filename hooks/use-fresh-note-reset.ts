import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RESET_KEY = '@freshNoteResetMinutes';

export const FRESH_NOTE_RESET_OPTIONS = [5, 15, 30, 60] as const;
export const DEFAULT_FRESH_NOTE_RESET_MINUTES = 5;

// Module-global + listeners (same pattern as use-home-screen) so Settings
// and the root-layout routing read the same value without a context.
let globalMinutes = DEFAULT_FRESH_NOTE_RESET_MINUTES;
let listeners: ((m: number) => void)[] = [];

function notify(m: number) {
  globalMinutes = m;
  listeners.forEach((l) => l(m));
}

/**
 * "New note reset": how long the app must be out of sight before opening it
 * lands on a fresh note (when the fresh-note home setting is on). Below the
 * threshold the previous view is restored instead.
 */
export function useFreshNoteReset() {
  const [minutes, setLocal] = useState(globalMinutes);

  useEffect(() => {
    AsyncStorage.getItem(RESET_KEY).then((value) => {
      const parsed = value ? parseInt(value, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) notify(parsed);
    });
    const listener = (m: number) => setLocal(m);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const setResetMinutes = useCallback((value: number) => {
    notify(value);
    AsyncStorage.setItem(RESET_KEY, String(value));
  }, []);

  return { resetMinutes: minutes, setResetMinutes };
}

/** Read the reset window directly (for routing logic outside React). */
export async function getFreshNoteResetMinutes(): Promise<number> {
  const value = await AsyncStorage.getItem(RESET_KEY);
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FRESH_NOTE_RESET_MINUTES;
}
