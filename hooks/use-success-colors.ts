import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SuccessLevel = 'unrecorded' | 'recorded' | 'double' | 'triple';

export type SuccessColors = Record<SuccessLevel, string>;

const STORAGE_KEY = '@success_colors';

const DEFAULT_COLORS_LIGHT: SuccessColors = {
  unrecorded: '#D5D8DC',
  recorded: '#2ECC71',
  double: '#F1C40F',
  triple: '#9B59B6',
};

const DEFAULT_COLORS_DARK: SuccessColors = {
  unrecorded: '#4A4D52',
  recorded: '#27AE60',
  double: '#D4AC0D',
  triple: '#8E44AD',
};

export const DEFAULT_SUCCESS_COLORS = {
  light: DEFAULT_COLORS_LIGHT,
  dark: DEFAULT_COLORS_DARK,
};

let globalColors: SuccessColors | null = null;
let listeners: Array<(c: SuccessColors | null) => void> = [];

function notify(colors: SuccessColors | null) {
  globalColors = colors;
  listeners.forEach((l) => l(colors));
}

export function useSuccessColors(colorScheme: 'light' | 'dark') {
  const [customColors, setLocal] = useState<SuccessColors | null>(globalColors);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value) {
        try {
          notify(JSON.parse(value));
        } catch {}
      }
    });

    const listener = (c: SuccessColors | null) => setLocal(c);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const colors: SuccessColors = customColors ?? DEFAULT_SUCCESS_COLORS[colorScheme];

  const setSuccessColor = useCallback(
    (level: SuccessLevel, color: string) => {
      const next = { ...colors, [level]: color };
      notify(next);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    [colors],
  );

  const resetColors = useCallback(() => {
    notify(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { colors, setSuccessColor, resetColors, isCustom: customColors !== null };
}
