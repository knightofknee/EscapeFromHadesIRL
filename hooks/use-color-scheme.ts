import { useColorScheme as useSystemColorScheme } from 'react-native';
import { useAppearance } from './use-appearance';

export function useColorScheme(): 'light' | 'dark' {
  const systemScheme = useSystemColorScheme();
  const { appearance } = useAppearance();

  if (appearance === 'light' || appearance === 'dark') {
    return appearance;
  }
  // RN 0.85's ColorSchemeName adds 'unspecified' — fold it into the same
  // dark default null always had.
  return systemScheme === 'light' || systemScheme === 'dark' ? systemScheme : 'dark';
}
