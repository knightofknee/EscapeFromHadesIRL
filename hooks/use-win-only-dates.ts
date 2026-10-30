import { useMemo } from 'react';
import { useUserSettingsContext } from '@/contexts/user-settings-context';
import { useTodayDate } from '@/hooks/use-today-date';
import { addDays } from '@/lib/date-utils';
import { winOnlyDates } from '@/lib/win-only';

/**
 * This user's win-only dates for 60-day quests (their birthday week), from a year and a half back to a quest's length ahead: enough
 * for any quest, credit lookback, or badge status replay.
 */
export function useWinOnlyDates(): Set<string> {
  const { birthday } = useUserSettingsContext();
  const { todayStr } = useTodayDate();
  return useMemo(
    () =>
      winOnlyDates({ birthday, from: addDays(todayStr, -548), to: addDays(todayStr, 60) }),
    [birthday, todayStr],
  );
}
