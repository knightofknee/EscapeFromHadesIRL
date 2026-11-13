import { useEffect, useMemo } from 'react';
import { useHabitQuest } from '@/contexts/habit-quest-context';
import { useRecordsContext } from '@/contexts/records-context';
import { useHabits } from '@/hooks/use-habits';
import { useTodayDate } from '@/hooks/use-today-date';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyDates } from '@/hooks/use-win-only-dates';
import { useHabitQuestProgress } from '@/hooks/use-habit-quest-progress';
import { addDays } from '@/lib/date-utils';
import { didParticipate, type QuestLevel } from '@/lib/habit-quest';
import { isTieredHabit, recordLevel } from '@/lib/habit-scoring';
import type { HabitRecord } from '@/types/habit';
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
  /** Maintenance strength (0..1) today, any level counting. */
  strength: number;
  /** How it's holding up since, any level counting; null until the window's records arrive. */
  status: MaintenanceStatus | null;
  /**
   * Set once the badge is upgraded (a Level Two quest finished at 50%+):
   * the same replay with only goal-or-better days counting. An upgraded
   * badge shows this status, with blue in place of green for strong.
   */
  levelTwo: { strength: number; status: MaintenanceStatus | null } | null;
  /** Habit strength (0..1) counting ideal days alone: what comes next. Null for habits without an ideal level. */
  ideal: number | null;
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

/** Habits whose badge is upgraded: a Level Two quest finished at or above STRENGTH_LINE. */
export function useUpgradedHabits(): Set<string> {
  const { pastLevelTwo } = useHabitQuest();
  const { activeQuest, progress } = useHabitQuestProgress(2);
  return useMemo(() => {
    const out = new Set<string>();
    for (const q of pastLevelTwo) {
      if (q.finalStrength == null || q.finalStrength >= STRENGTH_LINE) out.add(q.habitId);
    }
    // Past day 60 but not yet closed out on the Quests tab: already upgraded.
    if (activeQuest && progress?.earnedBadge) out.add(activeQuest.habitId);
    return out;
  }, [pastLevelTwo, activeQuest, progress?.earnedBadge]);
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
  const upgraded = useUpgradedHabits();
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
      const replayBy = (counts: (rec: HabitRecord | undefined) => boolean) => {
        const doneToday = counts(recordsMap.get(`${habit.id}_${todayStr}`));
        const through = doneToday ? todayStr : addDays(todayStr, -1);
        const { strength, daysUnder } = strengthOver(windowStart, through, (date) =>
          counts(recordsMap.get(`${habit.id}_${date}`))
            ? 'done'
            : dateSet.has(date) || winOnly.has(date)
              ? 'excused'
              : 'missed',
        );
        return { strength, status: windowLoaded ? maintenanceStatus(strength, daysUnder) : null };
      };
      const replay = (level: QuestLevel) => replayBy((rec) => didParticipate(habit, rec, level));
      const levelOne = replay(1);
      badges.set(habit.id, {
        earned: earned.count,
        design: earned.design,
        strength: levelOne.strength,
        status: levelOne.status,
        levelTwo: upgraded.has(habit.id) ? replay(2) : null,
        ideal: isTieredHabit(habit) ? replayBy((rec) => recordLevel(habit, rec) >= 3).strength : null,
      });
    }
    return badges;
  }, [habits, earnedByHabit, upgraded, recordsMap, dateSet, winOnly, todayStr, windowStart, windowLoaded]);
}
