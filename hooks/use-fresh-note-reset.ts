import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RESET_KEY = '@freshNoteResetMinutes';

/** Quick picks. Any whole number of minutes in range is also allowed. */
export const FRESH_NOTE_RESET_OPTIONS = [5, 15, 30, 60] as const;
export const DEFAULT_FRESH_NOTE_RESET_MINUTES = 5;
/** Storage needs a positive integer, so 1 is the floor. The window is
 *  compared against the time the app was last hidden, and a window past a
 *  full day means the previous view is always restored, so 1440 (24 hours)
 *  is the ceiling. Settings states both. */
export const MIN_FRESH_NOTE_RESET_MINUTES = 1;
export const MAX_FRESH_NOTE_RESET_MINUTES = 1440;

/** Whole minutes inside the stated range; anything else falls to the edge. */
export function clampFreshNoteResetMinutes(value: number): number {
  const whole = Math.round(value);
  if (!Number.isFinite(whole)) return DEFAULT_FRESH_NOTE_RESET_MINUTES;
  return Math.min(MAX_FRESH_NOTE_RESET_MINUTES, Math.max(MIN_FRESH_NOTE_RESET_MINUTES, whole));
}

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
    const minutes = clampFreshNoteResetMinutes(value);
    notify(minutes);
    AsyncStorage.setItem(RESET_KEY, String(minutes));
  }, []);

  return { resetMinutes: minutes, setResetMinutes };
}

/** Read the reset window directly (for routing logic outside React). */
export async function getFreshNoteResetMinutes(): Promise<number> {
  const value = await AsyncStorage.getItem(RESET_KEY);
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FRESH_NOTE_RESET_MINUTES;
}
