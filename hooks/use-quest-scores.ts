import { useMemo } from 'react';
import { formatDate } from '@/lib/date-utils';
import { FOUNDATION_KEYS } from '@/constants/quest-templates';
import type { Quest } from '@/types/quest';
import type { Habit, HabitRecord } from '@/types/habit';

export type QuestScore = {
  questId: string;
  // How many days completed in the window
  completedDays: number;
  // How many days targeted in the window
  targetDays: number;
  // Raw execution % (0-100), before any bonuses
  executionPct: number;
  // How many days in the window had a 'double'/'goal' (level 2) completion on any linked habit
  doubleDays: number;
  // How many days in the window had an 'ideal' (level 3) completion on any linked quad habit
  idealDays: number;
  // Final score (0-100): execution + level bonus, capped at 100
  score: number;
};

export type QuestScores = {
  byQuest: Map<string, QuestScore>;
  // How many of the 3 foundation quests are active
  foundationCount: number;
  // Overall run score (0-100): average of quest scores * foundation multiplier
  runScore: number;
};

const WINDOW_DAYS = 30;

function getWindowDates(): string[] {
  const dates: string[] = [];
  const d = new Date();
  for (let i = 0; i < WINDOW_DAYS; i++) {
    dates.unshift(formatDate(d));
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

function scoreQuest(
  quest: Quest,
  habits: Habit[],
  recordIndex: Map<string, HabitRecord>,
  dates: string[],
): QuestScore {
  const linkedHabits = habits.filter((h) => quest.linkedHabitIds.includes(h.id));
  const targetDays = Math.max(1, Math.round((quest.targetDaysPerWeek / 7) * WINDOW_DAYS));

  let completedDays = 0;
  let doubleDays = 0;
  let idealDays = 0;

  for (const date of dates) {
    let dayCompleted = false;
    let dayDouble = false;
    let dayIdeal = false;

    for (const habit of linkedHabits) {
      const record = recordIndex.get(`${habit.id}_${date}`);
      if (!record) continue;

      const v = record.value;

      if (quest.questType === 'positive') {
        switch (habit.recordingMode) {
          case 'boolean':
            if (v !== false && v !== 'no') dayCompleted = true;
            break;
          case 'triple':
            if (v === 'double') {
              dayCompleted = true;
              dayDouble = true;
            } else if (v === 'yes') {
              dayCompleted = true;
            }
            break;
          case 'quad':
            if (v === 'ideal') {
              dayCompleted = true;
              dayDouble = true;
              dayIdeal = true;
            } else if (v === 'goal') {
              dayCompleted = true;
              dayDouble = true;
            } else if (v === 'yes') {
              dayCompleted = true;
            }
            break;
          case 'counter':
            if ((v as number) > 0) dayCompleted = true;
            break;
          case 'value':
            if (v) dayCompleted = true;
            break;
        }
      } else {
        // reduce quest: "completed" means the habit was NOT done
        // We'll count non-completion below after the loop
      }
    }

    if (quest.questType === 'positive') {
      if (dayCompleted) completedDays++;
      if (dayDouble) doubleDays++;
      if (dayIdeal) idealDays++;
    } else {
      // reduce: day is "good" if none of the linked habits were recorded as done
      let anyDone = false;
      for (const habit of linkedHabits) {
        const record = recordIndex.get(`${habit.id}_${date}`);
        if (!record) continue;
        const v = record.value;
        switch (habit.recordingMode) {
          case 'boolean':
            if (v !== false && v !== 'no') anyDone = true;
            break;
          case 'triple':
            if (v === 'yes' || v === 'double') anyDone = true;
            break;
          case 'quad':
            if (v === 'yes' || v === 'goal' || v === 'ideal') anyDone = true;
            break;
          case 'counter':
            if ((v as number) > 0) anyDone = true;
            break;
          case 'value':
            if (v) anyDone = true;
            break;
        }
      }
      if (!anyDone) completedDays++;
    }
  }

  const executionPct =
    quest.questType === 'positive'
      ? Math.min(100, Math.round((completedDays / targetDays) * 100))
      : Math.round((completedDays / WINDOW_DAYS) * 100);

  // Level bonus: goal days add 0.5 extra, ideal days add 1.0 extra (on top of goal bonus)
  let score = executionPct;
  if (quest.questType === 'positive' && (doubleDays > 0 || idealDays > 0)) {
    const goalBonus = (doubleDays * 0.5) / targetDays;
    const idealBonus = (idealDays * 0.5) / targetDays; // extra 0.5 on top of the goal 0.5
    score = Math.min(100, Math.round((completedDays / targetDays + goalBonus + idealBonus) * 100));
  }

  return { questId: quest.id, completedDays, targetDays, executionPct, doubleDays, idealDays, score };
}

export function useQuestScores(
  quests: Quest[],
  habits: Habit[],
  records: HabitRecord[],
): QuestScores {
  return useMemo(() => {
    const dates = getWindowDates();

    // Build record index: habitId_date → record
    const recordIndex = new Map<string, HabitRecord>();
    for (const r of records) {
      recordIndex.set(`${r.habitId}_${r.date}`, r);
    }

    const byQuest = new Map<string, QuestScore>();
    let totalScore = 0;

    for (const quest of quests) {
      const qs = scoreQuest(quest, habits, recordIndex, dates);
      byQuest.set(quest.id, qs);
      totalScore += qs.score;
    }

    // Foundation bonus: how many of the 3 foundation quests are active
    const activeTemplateKeys = new Set(
      quests.filter((q) => q.templateKey !== null).map((q) => q.templateKey as string),
    );
    const foundationCount = FOUNDATION_KEYS.filter((k) => activeTemplateKeys.has(k)).length;

    // Run score = sum of quest scores * foundation multiplier (5% per foundation quest)
    // Adding quests can only increase your score, never decrease it
    const multiplier = 1 + foundationCount * 0.05;
    const runScore = Math.round(totalScore * multiplier);

    return { byQuest, foundationCount, runScore };
  }, [quests, habits, records]);
}
