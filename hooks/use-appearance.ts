import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Appearance = 'system' | 'light' | 'dark';

const STORAGE_KEY = '@appearance';

let globalAppearance: Appearance = 'dark';
let listeners: Array<(a: Appearance) => void> = [];

function notify(appearance: Appearance) {
  globalAppearance = appearance;
  listeners.forEach((l) => l(appearance));
}

export function useAppearance() {
  const [appearance, setLocal] = useState<Appearance>(globalAppearance);

  useEffect(() => {
    // Load saved preference on first mount
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'light' || value === 'dark' || value === 'system') {
        notify(value);
      }
    });

    const listener = (a: Appearance) => setLocal(a);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const setAppearance = useCallback((value: Appearance) => {
    notify(value);
    AsyncStorage.setItem(STORAGE_KEY, value);
  }, []);

  return { appearance, setAppearance };
}
