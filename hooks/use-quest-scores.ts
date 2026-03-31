import { useMemo } from 'react';
import { formatDate } from '@/lib/date-utils';
import { FOUNDATION_KEYS } from '@/constants/quest-templates';
import type { Quest } from '@/types/quest';
import type { Habit, HabitRecord } from '@/types/habit';

export type QuestScore = {
  questId: string;
  // Raw execution % (0-100), before any bonuses
  executionPct: number;
  // How many days in the window had a 'double' (level 2) completion on any linked triple habit
  doubleDays: number;
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

  for (const date of dates) {
    let dayCompleted = false;
    let dayDouble = false;

    for (const habit of linkedHabits) {
      const record = recordIndex.get(`${habit.id}_${date}`);
      if (!record) continue;

      const v = record.value;

      if (quest.questType === 'positive') {
        switch (habit.recordingMode) {
          case 'boolean':
            if (v === true) dayCompleted = true;
            break;
          case 'triple':
            if (v === 'double') {
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
    } else {
      // reduce: day is "good" if none of the linked habits were recorded as done
      let anyDone = false;
      for (const habit of linkedHabits) {
        const record = recordIndex.get(`${habit.id}_${date}`);
        if (!record) continue;
        const v = record.value;
        switch (habit.recordingMode) {
          case 'boolean':
            if (v === true) anyDone = true;
            break;
          case 'triple':
            if (v === 'yes' || v === 'double') anyDone = true;
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

  // Level bonus: each double day adds 0.5 extra completion point toward execution
  // Recompute with bonus for positive quests with triple habits
  let score = executionPct;
  if (quest.questType === 'positive' && doubleDays > 0) {
    const bonusPoints = (doubleDays * 0.5) / targetDays;
    score = Math.min(100, Math.round((completedDays / targetDays + bonusPoints) * 100));
  }

  return { questId: quest.id, executionPct, doubleDays, score };
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

    // Run score = average of quest scores * foundation multiplier (5% per foundation quest)
    const avgScore = quests.length > 0 ? totalScore / quests.length : 0;
    const multiplier = 1 + foundationCount * 0.05;
    const runScore = Math.min(100, Math.round(avgScore * multiplier));

    return { byQuest, foundationCount, runScore };
  }, [quests, habits, records]);
}
