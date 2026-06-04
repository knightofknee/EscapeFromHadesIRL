import { useUserSettingsContext } from '@/contexts/user-settings-context';

/**
 * Per-user toggle: whether weekend days where a habit wasn't completed are
 * skipped from stats (instead of counted as misses). Stored on
 * `userSettings/{uid}` alongside the success-color customizations and read
 * through the shared UserSettingsProvider (one listener for the whole doc).
 * Return shape is unchanged so call sites don't change.
 */
export function useWinOnlyWeekends() {
  const { winOnlyWeekends, setWinOnlyWeekends } = useUserSettingsContext();
  return { winOnlyWeekends, setWinOnlyWeekends };
}
