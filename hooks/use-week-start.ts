import { useUserSettingsContext } from '@/contexts/user-settings-context';

/**
 * Per-user first day of the week (1 = Monday, 0 = Sunday), stored on
 * `userSettings/{uid}` like the other toggles. Every week grid in the app
 * (week strip, month heatmap, chore calendar, PDFs) reads it.
 */
export function useWeekStart() {
  const { weekStartsOn, setWeekStartsOn } = useUserSettingsContext();
  return { weekStartsOn, setWeekStartsOn };
}
