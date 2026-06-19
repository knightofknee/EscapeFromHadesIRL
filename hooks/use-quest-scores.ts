import { useMemo, useRef } from 'react';
import { formatDate } from '@/lib/date-utils';
import { shouldSkipWeekend, isTieredMode, recordLevel } from '@/lib/habit-scoring';
import type { Quest } from '@/types/quest';
import type { Habit, HabitRecord } from '@/types/habit';

export type QuestScore = {
  questId: string;
  // How many days completed in the window. For REDUCE quests this is instead
  // the days the user ABSTAINED ("clean" days).
  completedDays: number;
  // How many days targeted in the window
  targetDays: number;
  // Active days in the window after vacation days (and, with Win-only
  // Weekends, unfulfilled weekend days) are stripped. The target scales to
  // this, so surface it wherever targetDays is shown — "19 day goal" only
  // makes sense next to "27 active days".
  windowDays: number;
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
  // The 18-month run's day counts, for quests whose scoreWindow is '18mo'
  // (their detail line shows these instead of the 30-day numbers).
  completedDays18?: number;
  targetDays18?: number;
  // For all-habit quests: the habit whose score is being shown (the
  // highest scorer for this quest's goal/window).
  bestHabitId?: string;
  // Points earned toward the run score (partial credit: 30d% × value30 +
  // 18mo% × value18, rounded). Optional like score18mo.
  pointsEarned?: number;
  // Max points this quest can contribute (value30 + value18).
  pointsAvailable?: number;
  // The bar the quest is actually scored against. Differs from
  // quest.successLevel when the legacy tierless-link fallback applies —
  // badges and point values must reflect what's enforced, not the stored
  // field.
  effectiveSuccessLevel?: number;
  // True when a non-allHabits quest has no resolvable linked habit
  // (deleted/archived/unlinked). Such a quest tracks nothing; it's excluded
  // from the run-score totals so it can neither bank free points (reduce
  // quests degenerate to a perpetual 100%) nor drag the run down.
  missingHabit?: boolean;
};

export type QuestScores = {
  byQuest: Map<string, QuestScore>;
  // Run score = total points earned across all active quests (partial
  // credit, so it falls as averages fall below their goals).
  runScore: number;
  // Max points available across all active quests.
  totalAvailable: number;
  // runScore / totalAvailable as 0-100, for bars and flame-color thresholds.
  runPct: number;
};

/**
 * Point values — how much a quest counts for.
 *
 * The value scales with what the quest demands:
 * - weekly commitment: targetDaysPerWeek for positive quests; for reduce
 *   quests the days you must abstain beyond the allowance (7 - allowed).
 * - success-level bar (quad-family habits): basic ×1, goal ×1.5, ideal ×2.
 *
 * 30-day value = commitment × 10 × level multiplier.
 * Level multipliers honor real difficulty: goal days are twice the work of
 * basic days (×2), ideal days are in another league entirely (×4).
 * 18-month value = 6 × the 30-day value — holding an average for eighteen
 * months (where every pre-tracking day counts as 0) is vastly harder than a
 * good month, so the long window dominates the board.
 *
 * scoreWindow narrows which windows the quest earns from: a '30d' quest is
 * worth only the 30-day value, an '18mo' quest only the (6×) 18-month value;
 * 'both'/undefined (legacy + original base challenges) earns from both.
 */
export function questPointValue(
  quest: Pick<Quest, 'targetDaysPerWeek' | 'questType' | 'successLevel' | 'scoreWindow'>,
): { value30: number; value18: number; total: number } {
  const commitment =
    quest.questType === 'reduce'
      ? Math.max(1, 7 - quest.targetDaysPerWeek)
      : Math.max(1, quest.targetDaysPerWeek);
  const levelMult = quest.successLevel === 3 ? 4 : quest.successLevel === 2 ? 2 : 1;
  const base = commitment * 10 * levelMult;
  const window = quest.scoreWindow ?? 'both';
  const value30 = window === '18mo' ? 0 : base;
  const value18 = window === '30d' ? 0 : base * 6;
  return { value30, value18, total: value30 + value18 };
}

const WINDOW_DAYS = 30;
const WINDOW_DAYS_18MO = 548; // ~18 months

function getWindowDates(days: number): string[] {
  // Build descending (today → oldest) with O(1) push, then reverse once to get
  // ascending order. The previous unshift-in-loop was O(n²) (~300k ops for the
  // 548-day window) and ran on every quest render / records update.
  const dates: string[] = [];
  const d = new Date();
  for (let i = 0; i < days; i++) {
    dates.push(formatDate(d));
    d.setDate(d.getDate() - 1);
  }
  return dates.reverse();
}

export function scoreQuest(
  quest: Quest,
  habits: Habit[],
  recordIndex: Map<string, HabitRecord>,
  dates: string[],
  winOnlyWeekends: boolean = false,
  // When set, score only the most recent `windowSize` COUNTING days. Pass a
  // deep candidate pool (the caller passes the whole 18-month range) so the
  // window backfills past vacation/skipped days and is always full — the
  // user never sees a shrunken goal.
  windowSize?: number,
): QuestScore {
  const linkedHabits = habits.filter((h) => quest.linkedHabitIds.includes(h.id));
  // The quest's required bar: 1 basic (yes), 2 goal, 3 ideal. Undefined
  // defaults to 1, preserving "any completion counts" for legacy quests.
  let required = quest.questType === 'positive' ? (quest.successLevel ?? 1) : 1;
  // Legacy contract for LINKED quests: successLevel was "ignored for
  // non-quad habits". Old docs can carry successLevel 2/3 while linked to a
  // tierless habit (the old UI never reset it) — an unreachable bar would
  // silently score 0 forever, so fall back to basic. All-habit trials keep
  // the strict bar: there, "tier 2" genuinely means only tier-capable
  // habits count (scoreAllHabitsQuest passes single-habit quests with
  // allHabits still set).
  if (
    !quest.allHabits &&
    required > 1 &&
    linkedHabits.length > 0 &&
    !linkedHabits.some((h) => isTieredMode(h.recordingMode))
  ) {
    required = 1;
  }
  const meetsBar = (habit: Habit, record?: HabitRecord) => recordLevel(habit, record) >= required;

  // For positive quests with "Win only Weekends" on: a weekend day where no
  // linked habit reached this quest's bar simply doesn't exist for this
  // quest — the user had nothing to gain and shouldn't lose. Vacation days
  // are stripped upstream by the caller the same way. Reduce quests are
  // unaffected (their win condition is non-completion).
  const activeDates =
    winOnlyWeekends && quest.questType === 'positive' && linkedHabits.length > 0
      ? dates.filter((date) =>
          linkedHabits.some((habit) => {
            const record = recordIndex.get(`${habit.id}_${date}`);
            return !shouldSkipWeekend(habit, record, date, true, meetsBar);
          }),
        )
      : dates;
  // Backfill: keep only the most recent windowSize counting days, so the
  // window (and therefore the goal) is always full-size regardless of how
  // many vacation/weekend days were skipped along the way.
  const windowDates =
    windowSize != null && activeDates.length > windowSize
      ? activeDates.slice(-windowSize)
      : activeDates;
  const windowDays = Math.max(1, windowDates.length);
  const targetDays = Math.max(1, Math.round((quest.targetDaysPerWeek / 7) * windowDays));

  let completedDays = 0;
  let doubleDays = 0;
  let idealDays = 0;

  for (const date of windowDates) {
    if (quest.questType === 'positive') {
      let dayCompleted = false;
      let dayDouble = false;
      let dayIdeal = false;

      for (const habit of linkedHabits) {
        const level = recordLevel(habit, recordIndex.get(`${habit.id}_${date}`));
        if (level >= required) dayCompleted = true;
        // "Extra effort" = exceeding this quest's required bar.
        if (level > required) dayDouble = true;
        if (level === 3 && required < 3) dayIdeal = true;
        // Found everything a day can award — stop scanning.
        if (dayCompleted && dayDouble && dayIdeal) break;
      }

      if (dayCompleted) completedDays++;
      if (dayDouble) doubleDays++;
      if (dayIdeal) idealDays++;
    } else {
      // reduce: day is "clean" if none of the linked habits were done at all
      let anyDone = false;
      for (const habit of linkedHabits) {
        if (recordLevel(habit, recordIndex.get(`${habit.id}_${date}`)) >= 1) {
          anyDone = true;
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

  return { questId: quest.id, completedDays, targetDays, windowDays, executionPct, doubleDays, idealDays, score };
}

/**
 * Score an all-habit quest: every habit is scored individually against the
 * quest's bar, and the quest shows the SINGLE best habit ("any habit above
 * 4×/wk" means SOME habit holds that average — not a union of days stitched
 * across different habits). Returns both windows from that best habit plus
 * its id, so the UI can show which habit is being tracked. The search
 * early-exits when a habit fully meets the goal.
 */
export function scoreAllHabitsQuest(
  quest: Quest,
  habits: Habit[],
  recordIndex: Map<string, HabitRecord>,
  dates: string[],
  winOnlyWeekends: boolean = false,
): { qs: QuestScore; qs18: QuestScore; bestHabitId?: string } {
  let best: { s30: QuestScore; s18: QuestScore; windowScore: number; habitId: string } | null = null;

  for (const habit of habits) {
    const single: Quest = { ...quest, linkedHabitIds: [habit.id] };
    const s30 = scoreQuest(single, habits, recordIndex, dates, winOnlyWeekends, WINDOW_DAYS);
    const s18 = scoreQuest(single, habits, recordIndex, dates, winOnlyWeekends);
    const windowScore = quest.scoreWindow === '18mo' ? s18.score : s30.score;
    if (!best || windowScore > best.windowScore) {
      best = { s30, s18, windowScore, habitId: habit.id };
    }
    if (best.windowScore >= 100) break; // a habit fully meets the goal
  }

  if (!best) {
    const empty: Quest = { ...quest, linkedHabitIds: [] };
    return {
      qs: scoreQuest(empty, habits, recordIndex, dates, winOnlyWeekends, WINDOW_DAYS),
      qs18: scoreQuest(empty, habits, recordIndex, dates, winOnlyWeekends),
    };
  }
  return { qs: best.s30, qs18: best.s18, bestHabitId: best.habitId };
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
    // Vacation days are removed from the timeline before scoring — they
    // simply don't exist for quests. The 30-day window then BACKFILLS past
    // them (scoreQuest takes the most recent 30 counting days from this
    // deep pool), so the goal is always a full 30 days' worth and the user
    // never sees a shrunken target.
    const filterVac = (ds: string[]) =>
      vacationSet ? ds.filter((d) => !vacationSet.has(d)) : ds;
    const datesPool = filterVac(getWindowDates(WINDOW_DAYS_18MO));

    // Build record index: habitId_date → record
    const recordIndex = new Map<string, HabitRecord>();
    for (const r of records) {
      recordIndex.set(`${r.habitId}_${r.date}`, r);
    }

    const byQuest = new Map<string, QuestScore>();
    let totalEarned = 0;
    let totalAvailable = 0;

    for (const quest of quests) {
      // 18-month scores ALWAYS use the full window — the past 18 months,
      // regardless of when the quest (or tracking) started. Days with no
      // record count as 0: not-done for positive quests, zero occurrences
      // (clean) for reduce quests. Activation date has no impact — user
      // decision 2026-06-10; do not clamp this window.
      const linkedHabits = quest.allHabits
        ? habits
        : habits.filter((h) => quest.linkedHabitIds.includes(h.id));
      const missingHabit = !quest.allHabits && linkedHabits.length === 0;
      // Same predicate as scoreQuest's legacy fallback: when the stored bar
      // is unreachable on a tierless linked habit, the quest is ENFORCED at
      // basic — so it must also be valued (and badged) at basic, not earn
      // ×2/×4 points for basic-bar performance.
      const effectiveSuccessLevel =
        !quest.allHabits &&
        (quest.successLevel ?? 1) > 1 &&
        linkedHabits.length > 0 &&
        !linkedHabits.some((h) => isTieredMode(h.recordingMode))
          ? 1
          : (quest.successLevel ?? 1);

      let qs: QuestScore;
      let qs18: QuestScore;
      let bestHabitId: string | undefined;
      if (quest.allHabits) {
        ({ qs, qs18, bestHabitId } = scoreAllHabitsQuest(
          quest, habits, recordIndex, datesPool, winOnlyWeekends,
        ));
      } else {
        qs = scoreQuest(quest, habits, recordIndex, datesPool, winOnlyWeekends, WINDOW_DAYS);
        qs18 = scoreQuest(quest, habits, recordIndex, datesPool, winOnlyWeekends);
      }

      // Partial credit: each window's % earns its share of that window's
      // point value, so the run score falls as averages fall below goal.
      const { value30, value18, total } = questPointValue({
        ...quest,
        successLevel: effectiveSuccessLevel,
      });
      const earned = missingHabit
        ? 0
        : (qs.score / 100) * value30 + (qs18.score / 100) * value18;
      // Accumulate the ROUNDED per-quest value — the header total must equal
      // the sum of the points the cards display.
      const earnedRounded = Math.round(earned);
      byQuest.set(quest.id, {
        ...qs,
        score18mo: qs18.score,
        completedDays18: qs18.completedDays,
        targetDays18: qs18.targetDays,
        bestHabitId,
        pointsEarned: earnedRounded,
        pointsAvailable: missingHabit ? 0 : total,
        effectiveSuccessLevel,
        missingHabit,
      });
      totalEarned += earnedRounded;
      totalAvailable += missingHabit ? 0 : total;
    }

    const runScore = Math.round(totalEarned);
    const runPct = totalAvailable > 0 ? Math.round((totalEarned / totalAvailable) * 100) : 0;

    const result = { byQuest, runScore, totalAvailable, runPct };
    cacheRef.current = result;
    return result;
  }, [quests, habits, records, vacationSet, winOnlyWeekends, enabled]);
}
