import { useEffect, useMemo } from 'react';
import { useHabitQuest } from '@/contexts/habit-quest-context';
import { useRecordsContext } from '@/contexts/records-context';
import { useHabits } from '@/hooks/use-habits';
import { useTodayDate } from '@/hooks/use-today-date';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyDates } from '@/hooks/use-win-only-dates';
import { useHabitQuestProgress } from '@/hooks/use-habit-quest-progress';
import { addDays } from '@/lib/date-utils';
import { didParticipate } from '@/lib/habit-quest';
import { designForNumber, numberBadges, type BadgeDesign, type NumberedBadge } from '@/lib/badge-designs';
import type { HabitQuest } from '@/types/habit-quest';
import {
  MAINTENANCE_WINDOW_DAYS,
  STRENGTH_LINE,
  maintenanceStatus,
  strengthOver,
  type MaintenanceStatus,
} from '@/lib/habit-strength';

export type HabitBadge = {
  /** Badges earned on this habit: 60-day quests finished at or above STRENGTH_LINE. */
  earned: number;
  /** The design of the latest badge earned on it (each badge is its own; see lib/badge-designs). */
  design: BadgeDesign;
  /** Maintenance strength (0..1) today. */
  strength: number;
  /** How it's holding up since; null until the window's records arrive. */
  status: MaintenanceStatus | null;
};

/**
 * Every badge earned, numbered in the order earned, each with its
 * preselected design. Unclaimed (past day 60 but not yet closed out) quests
 * aren't in here yet; they get the next number when claimed.
 */
export function useEarnedBadges(): NumberedBadge<HabitQuest>[] {
  const { pastQuests } = useHabitQuest();
  return useMemo(
    () => numberBadges(pastQuests.filter((q) => q.finalStrength == null || q.finalStrength >= STRENGTH_LINE)),
    [pastQuests],
  );
}

/**
 * Badges earned on habits (a 60-day quest finished at 50%+ habit strength):
 * how many, today's maintenance strength (the habit-strength model replayed
 * over the last MAINTENANCE_WINDOW_DAYS), and how it's holding up: strong,
 * kept up, or in remission (see maintenanceStatus). Only
 * habits with a badge get a strength, so the records window only grows
 * when someone has earned one.
 */
export function useHabitBadges(): Map<string, HabitBadge> {
  const { activeQuest, progress } = useHabitQuestProgress();
  const { habits } = useHabits();
  const { todayStr } = useTodayDate();
  const { recordsMap, loadedRange, ensureRange } = useRecordsContext();
  const { dateSet } = useVacationDays();
  const winOnly = useWinOnlyDates();

  const numbered = useEarnedBadges();
  // Per habit: how many badges, and the latest one's design.
  const earnedByHabit = useMemo(() => {
    const out = new Map<string, { count: number; design: BadgeDesign }>();
    for (const b of numbered) {
      out.set(b.quest.habitId, { count: (out.get(b.quest.habitId)?.count ?? 0) + 1, design: b.design });
    }
    // Past day 60 but not yet closed out on the Quests tab: already earned,
    // and it will be the next badge.
    if (activeQuest && progress?.earnedBadge) {
      out.set(activeQuest.habitId, {
        count: (out.get(activeQuest.habitId)?.count ?? 0) + 1,
        design: designForNumber(numbered.length + 1),
      });
    }
    return out;
  }, [numbered, activeQuest, progress?.earnedBadge]);

  const windowStart = addDays(todayStr, -(MAINTENANCE_WINDOW_DAYS - 1));
  const anyEarned = earnedByHabit.size > 0;
  useEffect(() => {
    if (anyEarned) ensureRange(windowStart, todayStr);
  }, [anyEarned, windowStart, todayStr, ensureRange]);

  // Until the window's records arrive, missing days would read as misses
  // and flash a false status.
  const windowLoaded = !!loadedRange && loadedRange.start <= windowStart && loadedRange.end >= todayStr;

  return useMemo(() => {
    const badges = new Map<string, HabitBadge>();
    for (const habit of habits) {
      const earned = earnedByHabit.get(habit.id);
      if (!earned) continue;
      // Today counts once it's done; an open today never fades anything.
      const doneToday = didParticipate(habit, recordsMap.get(`${habit.id}_${todayStr}`));
      const through = doneToday ? todayStr : addDays(todayStr, -1);
      const { strength, daysUnder } = strengthOver(windowStart, through, (date) =>
        didParticipate(habit, recordsMap.get(`${habit.id}_${date}`))
          ? 'done'
          : dateSet.has(date) || winOnly.has(date)
            ? 'excused'
            : 'missed',
      );
      badges.set(habit.id, {
        earned: earned.count,
        design: earned.design,
        strength,
        status: windowLoaded ? maintenanceStatus(strength, daysUnder) : null,
      });
    }
    return badges;
  }, [habits, earnedByHabit, recordsMap, dateSet, winOnly, todayStr, windowStart, windowLoaded]);
}
