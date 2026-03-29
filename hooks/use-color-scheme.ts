import { useColorScheme as useSystemColorScheme } from 'react-native';
import { useAppearance } from './use-appearance';

export function useColorScheme(): 'light' | 'dark' {
  const systemScheme = useSystemColorScheme();
  const { appearance } = useAppearance();

  if (appearance === 'light' || appearance === 'dark') {
    return appearance;
  }
  return systemScheme ?? 'dark';
}
