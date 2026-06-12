import { useCallback } from 'react';
import { useUserSettingsContext } from '@/contexts/user-settings-context';

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

const DEFAULT_SUCCESS_COLORS = {
  light: DEFAULT_COLORS_LIGHT,
  dark: DEFAULT_COLORS_DARK,
};

/**
 * Resolves the active success-color palette for the given scheme. The raw
 * stored overrides + write paths live in the shared UserSettingsProvider (one
 * `userSettings/{uid}` listener); this hook layers the scheme-specific default
 * fallback on top. Return shape is unchanged so call sites don't change.
 */
export function useSuccessColors(colorScheme: 'light' | 'dark') {
  const { successColors: customColors, setSuccessColors } = useUserSettingsContext();

  const colors: SuccessColors = customColors ?? DEFAULT_SUCCESS_COLORS[colorScheme];

  const setSuccessColor = useCallback(
    (level: SuccessLevel, color: string) => {
      // Seed from the currently-resolved palette so the first customization of
      // any level keeps the other levels at their (scheme-appropriate) values.
      setSuccessColors({ ...colors, [level]: color });
    },
    [colors, setSuccessColors],
  );

  const resetColors = useCallback(() => {
    setSuccessColors(null);
  }, [setSuccessColors]);

  return { colors, setSuccessColor, resetColors, isCustom: customColors !== null };
}
