import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, setDoc, onSnapshot } from '@/lib/firebase/firestore';

export type SuccessLevel = 'unrecorded' | 'recorded' | 'double' | 'triple';

export type SuccessColors = Record<SuccessLevel, string>;

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

export function useSuccessColors(colorScheme: 'light' | 'dark') {
  const { user } = useAuth();
  const [customColors, setCustomColors] = useState<SuccessColors | null>(null);

  useEffect(() => {
    if (!user) {
      setCustomColors(null);
      return;
    }

    const ref = doc(db, 'userSettings', user.uid);
    const unsubscribe = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (data?.successColors) {
        setCustomColors(data.successColors as SuccessColors);
      } else {
        setCustomColors(null);
      }
    });

    return unsubscribe;
  }, [user]);

  const colors: SuccessColors = customColors ?? DEFAULT_SUCCESS_COLORS[colorScheme];

  const setSuccessColor = useCallback(
    (level: SuccessLevel, color: string) => {
      if (!user) return;
      const next = { ...colors, [level]: color };
      setCustomColors(next);
      setDoc(doc(db, 'userSettings', user.uid), { successColors: next }, { merge: true });
    },
    [user, colors],
  );

  const resetColors = useCallback(() => {
    if (!user) return;
    setCustomColors(null);
    setDoc(doc(db, 'userSettings', user.uid), { successColors: null }, { merge: true });
  }, [user]);

  return { colors, setSuccessColor, resetColors, isCustom: customColors !== null };
}
