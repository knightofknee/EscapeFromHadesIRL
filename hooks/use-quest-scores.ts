import { useMemo, useRef } from 'react';
import { formatDate } from '@/lib/date-utils';
import { shouldSkipWeekend } from '@/lib/habit-scoring';
import { FOUNDATION_KEYS } from '@/constants/quest-templates';
import type { Quest } from '@/types/quest';
import type { Habit, HabitRecord } from '@/types/habit';

export type QuestScore = {
  questId: string;
  // How many days completed in the window. For REDUCE quests this is instead
  // the days the user ABSTAINED ("clean" days).
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
  // Same scoring over the FULL ~18-month window: days before the user started
  // tracking count as "not done", so a few months of use out of 18 reads low
  // — an honest long-term adherence number.
  // Optional: scoreQuest (single-window) omits it; useQuestScores fills it in.
  score18mo?: number;
};

export type QuestScores = {
  byQuest: Map<string, QuestScore>;
  // How many of the 3 foundation quests are active
  foundationCount: number;
  // Overall run score (0-100): average of quest scores * foundation multiplier
  runScore: number;
};

const WINDOW_DAYS = 30;
const WINDOW_DAYS_18MO = 548; // ~18 months

function getWindowDates(days: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  for (let i = 0; i < days; i++) {
    dates.unshift(formatDate(d));
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

export function scoreQuest(
  quest: Quest,
  habits: Habit[],
  recordIndex: Map<string, HabitRecord>,
  dates: string[],
  winOnlyWeekends: boolean = false,
): QuestScore {
  const linkedHabits = habits.filter((h) => quest.linkedHabitIds.includes(h.id));
  // For positive quests with "Win only Weekends" on: a weekend day where
  // every linked habit would be weekend-skipped contributes nothing — it's
  // a day where the user had nothing to gain and shouldn't lose. Pre-filter
  // such dates out of this quest's window so targetDays scales down with
  // them, just like vacation days do. Reduce quests are unaffected
  // (their win condition is non-completion, so the rule doesn't translate).
  const activeDates =
    winOnlyWeekends && quest.questType === 'positive' && linkedHabits.length > 0
      ? dates.filter((date) =>
          linkedHabits.some((habit) => {
            const record = recordIndex.get(`${habit.id}_${date}`);
            return !shouldSkipWeekend(habit, record, date, true);
          }),
        )
      : dates;
  // Window size = number of *active* days (vacation days are stripped
  // upstream by the caller; weekend non-positive days are stripped here
  // when "Win only Weekends" is enabled). Target scales with the active
  // window so a user on vacation or coasting through a quiet weekend isn't
  // punished — e.g. a 7-day-per-week quest needs the user to do it every
  // active day, regardless of how many days were excluded from the window.
  const windowDays = Math.max(1, activeDates.length);
  const targetDays = Math.max(1, Math.round((quest.targetDaysPerWeek / 7) * windowDays));

  let completedDays = 0;
  let doubleDays = 0;
  let idealDays = 0;

  for (const date of activeDates) {
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
          case 'steps':
          case 'meditation':
          case 'creativeWriting':
          case 'quad': {
            // This quest's required bar: 1 basic (yes), 2 goal, 3 ideal.
            // Undefined defaults to 1, preserving the old "any completion
            // counts" behavior for existing quests + base challenges.
            const required = quest.successLevel ?? 1;
            const level = v === 'ideal' ? 3 : v === 'goal' ? 2 : v === 'yes' ? 1 : 0;
            if (level >= required) dayCompleted = true;
            // "Extra effort" = exceeding this quest's required bar.
            if (level > required) dayDouble = true;
            if (level === 3 && required < 3) dayIdeal = true;
            break;
          }
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
          case 'steps':
          case 'meditation':
          case 'creativeWriting':
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

  let executionPct: number;
  if (quest.questType === 'positive') {
    executionPct = Math.min(100, Math.round((completedDays / targetDays) * 100));
  } else {
    // Reduce: targetDays is the MAX allowed "done" days in the window, and
    // completedDays here is the days the user ABSTAINED. To stay within the
    // allowance they must abstain at least (windowDays - allowed) days —
    // hitting or beating that is 100%, degrading toward 0 as they exceed the
    // cap. (Previously this ignored the cap and just scored % of days clean.)
    const requiredAbstained = windowDays - targetDays;
    executionPct =
      requiredAbstained <= 0
        ? 100 // allowance covers every day → nothing to fail
        : Math.min(100, Math.round((completedDays / requiredAbstained) * 100));
  }

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
  vacationSet?: Set<string>,
  winOnlyWeekends: boolean = false,
  // When false (screen not focused), reuse the last result instead of
  // recomputing — tabs stay mounted, so without this the score loop re-runs
  // on every records delta even when the user isn't on the quests screen.
  enabled: boolean = true,
): QuestScores {
  const cacheRef = useRef<QuestScores | null>(null);
  return useMemo(() => {
    if (!enabled && cacheRef.current) return cacheRef.current;
    // Vacation days are removed from the timeline before scoring — the
    // user "wasn't tracking" those days, so they shouldn't count for or
    // against the quest. scoreQuest scales targetDays to the active
    // window length, so a 7-day vacation just shrinks the window from
    // 30 → 23 days; the user still has to hit their per-week rate on
    // active days.
    const filterVac = (ds: string[]) =>
      vacationSet ? ds.filter((d) => !vacationSet.has(d)) : ds;
    const dates30 = filterVac(getWindowDates(WINDOW_DAYS));
    const dates18 = filterVac(getWindowDates(WINDOW_DAYS_18MO));

    // Build record index: habitId_date → record
    const recordIndex = new Map<string, HabitRecord>();
    for (const r of records) {
      recordIndex.set(`${r.habitId}_${r.date}`, r);
    }

    const byQuest = new Map<string, QuestScore>();
    let totalScore = 0;

    for (const quest of quests) {
      const qs = scoreQuest(quest, habits, recordIndex, dates30, winOnlyWeekends);
      // 18-month score uses the FULL window — days before the user started
      // tracking count as "not done", so the long-term bar honestly reflects
      // adherence across the whole 18 months. A few months of use out of 18
      // reads low, which is the point (it's a long-term, slow-moving number).
      const qs18 = scoreQuest(quest, habits, recordIndex, dates18, winOnlyWeekends);
      byQuest.set(quest.id, { ...qs, score18mo: qs18.score });
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

    const result = { byQuest, foundationCount, runScore };
    cacheRef.current = result;
    return result;
  }, [quests, habits, records, vacationSet, winOnlyWeekends, enabled]);
}
