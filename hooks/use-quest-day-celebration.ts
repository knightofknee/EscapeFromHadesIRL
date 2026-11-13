import { useEffect, useRef, useState, type RefObject } from 'react';
import type { View } from 'react-native';
import { useHabitQuest } from '@/contexts/habit-quest-context';
import { useRecordsContext } from '@/contexts/records-context';
import { useTodayDate } from '@/hooks/use-today-date';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';
import { computeStreak } from '@/lib/habit-streaks';
import { isRecordCompleted, isRecordGoal } from '@/lib/habit-scoring';
import { parseDate } from '@/lib/date-utils';
import { useHabitQuestProgress } from '@/hooks/use-habit-quest-progress';
import { didParticipate, type QuestLevel } from '@/lib/habit-quest';
import type { QuestBurst } from '@/components/habit-quest/quest-celebration';
import type { HabitRecord } from '@/types/habit';

/**
 * The Habits grid's per-day quest celebration, for the quest of `level`
 * (1 the 60-day quest, 2 Level Two). Fires on the not-recorded → recorded
 * flip for the viewed day (a tap, a modal save, or a steps sync while you
 * watch), never on load or a day swipe. Level Two counts only a goal-or-
 * better record as recorded. A flip while a tile modal is open waits for it
 * to close so the burst isn't hidden behind the sheet. A day the quest
 * card's check already celebrated (tabs freeze on blur, so that flip is
 * first seen here on refocus) is not played again.
 */
export function useQuestDayCelebration({
  level,
  records,
  viewedDate,
  isVacationDay,
  recordsLoading,
  tileModalOpen,
  isFocused,
  tileRef,
}: {
  level: QuestLevel;
  /** The viewed day's records, by habit id. */
  records: Map<string, HabitRecord>;
  viewedDate: string;
  isVacationDay: boolean;
  recordsLoading: boolean;
  tileModalOpen: boolean;
  isFocused: boolean;
  /** The quest tile, so the burst starts where it sits. */
  tileRef: RefObject<View | null>;
}) {
  const { activeQuest, habit: questHabit, progress: questProgress } = useHabitQuestProgress(level);
  const { celebratedDateRef, celebratedLevelTwoDateRef } = useHabitQuest();
  const [burst, setBurst] = useState<QuestBurst | null>(null);
  const { recordsMap, loadedRange } = useRecordsContext();
  const { todayStr } = useTodayDate();
  const { dateSet: vacationSet } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();

  const questDayDone =
    questHabit != null && !isVacationDay && didParticipate(questHabit, records.get(questHabit.id), level);
  const questDayInRange =
    questProgress != null &&
    !questProgress.isOver &&
    activeQuest != null &&
    viewedDate >= questProgress.attemptStart &&
    viewedDate <= questProgress.endDate;
  const seenRef = useRef<{ key: string; done: boolean } | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    const key = questHabit && questDayInRange && !recordsLoading ? `${questHabit.id}|${viewedDate}` : null;
    const prev = seenRef.current;
    seenRef.current = key ? { key, done: questDayDone } : null;
    if (!key) {
      pendingRef.current = false;
      return;
    }
    if (prev?.key === key && !prev.done && questDayDone) {
      // The card's check already played this day: skip it, once.
      if (level === 2 && celebratedLevelTwoDateRef.current === viewedDate) celebratedLevelTwoDateRef.current = null;
      else if (level === 1 && celebratedDateRef.current === viewedDate) celebratedDateRef.current = null;
      else pendingRef.current = true;
    }
    if (!questDayDone) pendingRef.current = false;
    if (pendingRef.current && !tileModalOpen && isFocused && questProgress && questHabit) {
      pendingRef.current = false;
      const next: QuestBurst = {
        key: Date.now(),
        doneCount: questProgress.doneCount,
        habitName: questHabit.name,
        palette: level === 2 ? 'deep' : 'rainbow',
        // The habit's streak right now, with the viewed day's fresh record
        // laid over the shared window in case it hasn't reached it yet.
        streak: (() => {
          const map = new Map(recordsMap);
          const fresh = records.get(questHabit.id);
          if (fresh) map.set(`${questHabit.id}_${viewedDate}`, fresh);
          return computeStreak(questHabit, map, level === 2 ? isRecordGoal : isRecordCompleted, vacationSet, {
            now: parseDate(todayStr),
            winOnlyWeekends,
            scanUntil: loadedRange?.start,
          }).current;
        })(),
      };
      // Burst from the tile itself (window coords; the overlay converts).
      const tile = tileRef.current;
      if (tile) {
        tile.measureInWindow((x, y, w, h) => setBurst({ ...next, origin: { x: x + w / 2, y: y + h / 2 } }));
      } else {
        setBurst(next);
      }
    }
  }, [questHabit, questDayInRange, recordsLoading, viewedDate, questDayDone, tileModalOpen, isFocused, questProgress, celebratedDateRef, celebratedLevelTwoDateRef, level, tileRef, records, recordsMap, vacationSet, todayStr, winOnlyWeekends, loadedRange]);

  return { questHabit, burst };
}
