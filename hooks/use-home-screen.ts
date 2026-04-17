import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HOME_KEY = '@homeScreen';

export type HomeScreen = 'default' | 'notes';

let globalHomeScreen: HomeScreen = 'default';
let listeners: Array<(h: HomeScreen) => void> = [];

function notify(h: HomeScreen) {
  globalHomeScreen = h;
  listeners.forEach((l) => l(h));
}

export function useHomeScreen() {
  const [home, setLocal] = useState<HomeScreen>(globalHomeScreen);

  useEffect(() => {
    AsyncStorage.getItem(HOME_KEY).then((value) => {
      if (value === 'notes' || value === 'default') notify(value);
    });
    const listener = (h: HomeScreen) => setLocal(h);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const setHomeScreen = useCallback((value: HomeScreen) => {
    notify(value);
    AsyncStorage.setItem(HOME_KEY, value);
  }, []);

  return { homeScreen: home, setHomeScreen };
}

/** Read home screen preference directly (for routing logic outside React). */
export async function getHomeScreen(): Promise<HomeScreen> {
  const v = await AsyncStorage.getItem(HOME_KEY);
  return v === 'notes' ? 'notes' : 'default';
}
