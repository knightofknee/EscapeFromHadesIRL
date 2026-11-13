import { useEffect, useMemo } from 'react';
import { useHabitQuest } from '@/contexts/habit-quest-context';
import { useRecordsContext } from '@/contexts/records-context';
import { useHabits } from '@/hooks/use-habits';
import { useTodayDate } from '@/hooks/use-today-date';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyDates } from '@/hooks/use-win-only-dates';
import { computeQuestProgress, type QuestLevel } from '@/lib/habit-quest';
import { addDays } from '@/lib/date-utils';
import { MAINTENANCE_WINDOW_DAYS } from '@/lib/habit-strength';

/**
 * The running quest of `level` (1 the 60-day quest, 2 Level Two) laid out
 * against today, live off the shared records window (registers the quest's
 * dates with RecordsProvider). Used by the Quests tab section and the Habits
 * grid celebration, so both count the same days.
 */
export function useHabitQuestProgress(level: QuestLevel = 1) {
  const { activeQuest: levelOne, activeLevelTwo } = useHabitQuest();
  const activeQuest = level === 2 ? activeLevelTwo : levelOne;
  const { habits } = useHabits();
  const { todayStr } = useTodayDate();
  const { recordsMap, loadedRange, ensureRange } = useRecordsContext();
  const { dateSet } = useVacationDays();
  const winOnly = useWinOnlyDates();

  const habitId = activeQuest?.habitId;
  const startDate = activeQuest?.startDate;
  const habit = useMemo(() => (habitId ? habits.find((h) => h.id === habitId) : undefined), [habits, habitId]);

  // Only the days that have happened need records. Skipped days push day
  // 60 out past questEndDate, so load through today.
  const rangeEnd = startDate ? todayStr : null;

  // Habit strength starts from the records before day 1, so load those too.
  const historyStart = startDate ? addDays(startDate, -MAINTENANCE_WINDOW_DAYS) : null;
  useEffect(() => {
    if (historyStart && rangeEnd) ensureRange(historyStart, rangeEnd);
  }, [historyStart, rangeEnd, ensureRange]);

  const progress = useMemo(() => {
    if (!startDate || !habitId) return null;
    return computeQuestProgress({
      startDate,
      today: todayStr,
      habit,
      getRecord: (date) => recordsMap.get(`${habitId}_${date}`),
      vacationDates: dateSet,
      winOnlyDates: winOnly,
      level,
    });
  }, [startDate, habitId, habit, todayStr, recordsMap, dateSet, winOnly, level]);

  const isLoading =
    historyStart && rangeEnd
      ? !(loadedRange && loadedRange.start <= historyStart && loadedRange.end >= rangeEnd)
      : false;

  return { activeQuest, habit, progress, isLoading };
}
