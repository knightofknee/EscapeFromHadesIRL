import { addDays } from '@/lib/date-utils';
import { isValueRecorded, recordLevel } from '@/lib/habit-scoring';
import {
  GAIN,
  MAINTENANCE_WINDOW_DAYS,
  STRENGTH_LINE,
  StrengthTrack,
  WEEK_DAYS,
  type DayOutcome,
} from '@/lib/habit-strength';
import type { Habit, HabitRecord } from '@/types/habit';

/** Two months: about the median time a new habit takes to form (Lally 2010: 66 days; Singh 2024: 59 to 66). */
export const QUEST_LENGTH = 60;

/** Day 60's date for a quest starting on `startDate` (day 1). */
export function questEndDate(startDate: string): string {
  return addDays(startDate, QUEST_LENGTH - 1);
}

/**
 * Did the habit get ANY participation on this record? Every success level
 * counts (basic, goal, ideal), and so does a value entry that fell short of
 * its first goal: the quest measures showing up, not hitting a bar.
 */
export function didParticipate(habit: Habit, record?: HabitRecord): boolean {
  if (!record) return false;
  if (recordLevel(habit, record) >= 1) return true;
  return habit.recordingMode === 'value' && isValueRecorded(record.value);
}

export type QuestDayState =
  | 'done'
  /** A past day with nothing recorded. */
  | 'missed'
  /** Today, not recorded yet. Still winnable. */
  | 'open'
  | 'future'
  /** A vacation day with nothing recorded (excused, not a miss). */
  | 'vacation'
  /** A win-only day (birthday week, custom window) with nothing recorded: excused. */
  | 'winOnly';

/** `dayNumber` is 1..60 for a counted day, null for a skipped one (excused and not recorded). */
export type QuestDay = { date: string; dayNumber: number | null; state: QuestDayState };

export type QuestProgress = {
  /** The current attempt's 60 days. */
  days: QuestDay[];
  /** Day 1 of the current attempt (the quest's startDate unless it restarted). */
  attemptStart: string;
  /** 1 for the first run; +1 each restart. */
  attemptNumber: number;
  /** The last day of the week that forced the latest restart, or null. */
  restartedOn: string | null;
  /** Why it restarted: a week with nothing, a week under the line after
   *  reaching it, or day 60 could no longer reach the line. */
  restartReason: 'weekOff' | 'weekUnder' | 'cantWin' | null;
  endDate: string;
  /** Days recorded this attempt, out of QUEST_LENGTH. */
  doneCount: number;
  missedCount: number;
  /** Today's day number in this attempt, 1..60; 61 once it's over. */
  todayNumber: number;
  /** Days after today still to come (0 on day 60 and after). */
  daysLeft: number;
  /** Today is past day 60 of this attempt: the quest is complete. */
  isOver: boolean;
  /** Habit strength (0..1) as of today, or as of day 60 once it's over. See lib/habit-strength. */
  strength: number;
  /** Over, and at or above the line on day 60: the badge is earned. */
  earnedBadge: boolean;
};

/** Strength on the last day if every one of `daysLeft` remaining days is done. */
export function bestFinish(strength: number, daysLeft: number): number {
  return 1 - (1 - strength) * Math.pow(1 - GAIN, daysLeft);
}

/** Whole days from `from` to `to` (YYYY-MM-DD), DST-proof. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Lay out the quest against today. `getRecord` returns the habit's record
 * for a date (undefined when none). Pure, so it's testable without
 * Firestore. A missing habit (deleted mid-quest) counts nothing as done.
 *
 * Restarts are derived, never stored: replaying the habit-strength model
 * from startDate, an attempt restarts after WEEK_DAYS straight misses, or,
 * once strength has reached STRENGTH_LINE, after WEEK_DAYS straight days
 * under it (so one miss just above the line never restarts anything), or
 * the day day 60 can no longer reach the line even with every remaining
 * day done (nobody stays in a quest they can't win). The next attempt
 * starts at the kept-up stretch running up to the restart, if any (the same
 * rule as picking a habit), else the day after. Excused (vacation) days
 * pause both week counts.
 * Backfilling a missed day can undo a restart, which is right: the record
 * says the habit was practiced. Today only counts once it's done; an open
 * today never decays anything.
 */
export function computeQuestProgress(params: {
  startDate: string;
  today: string;
  habit: Habit | undefined;
  getRecord: (date: string) => HabitRecord | undefined;
  vacationDates?: Set<string>;
  /** Win-only days (lib/win-only): recorded counts, missed is ignored. */
  winOnlyDates?: Set<string>;
}): QuestProgress {
  const { startDate, today, habit, getRecord, vacationDates, winOnlyDates } = params;
  const isDone = (date: string) => !!habit && didParticipate(habit, getRecord(date));
  const isExcused = (date: string) => !!vacationDates?.has(date) || !!winOnlyDates?.has(date);
  const outcomeOn = (date: string): DayOutcome => (isDone(date) ? 'done' : isExcused(date) ? 'excused' : 'missed');
  // A skipped day (vacation or win-only, not recorded) doesn't use up one of
  // the 60: it gets no day number and pushes day 60 out. Recorded, it counts
  // like any other day. Future excused days are assumed skipped.
  const isSkipped = (date: string) => isExcused(date) && !(date <= today && isDone(date));
  const endOf = (start: string) => questEndAfterSkips(start, isSkipped);

  let attemptStart = startDate;
  let attemptNumber = 1;
  let restartedOn: string | null = null;
  let restartReason: QuestProgress['restartReason'] = null;
  let strength = 0;
  // Replay the current attempt; on a restart, replay again from the new
  // day 1. Each restart moves day 1 strictly later, so this ends.
  replay: for (;;) {
    // Habit strength is the habit's, not the quest's: day 1 starts from what
    // the records before it already built (the same lookback badge status
    // uses), so a habit kept for years doesn't start a quest at 0%.
    const track = new StrengthTrack();
    for (let d = addDays(attemptStart, -MAINTENANCE_WINDOW_DAYS); d < attemptStart; d = addDays(d, 1)) {
      track.step(outcomeOn(d));
    }
    strength = track.average;
    let reachedLine = strength >= STRENGTH_LINE;
    let missStreak = 0;
    let underStreak = 0;
    let counted = 0;
    const attemptEnd = endOf(attemptStart);
    for (let d = attemptStart; d <= today && d <= attemptEnd; d = addDays(d, 1)) {
      const outcome = outcomeOn(d);
      if (d === today && outcome !== 'done') break;
      track.step(outcome);
      strength = track.average;
      if (!isSkipped(d)) counted++;
      if (strength >= STRENGTH_LINE) reachedLine = true;
      if (outcome !== 'excused') {
        missStreak = outcome === 'missed' ? missStreak + 1 : 0;
        underStreak = reachedLine && strength < STRENGTH_LINE ? underStreak + 1 : 0;
      }
      const reason =
        missStreak >= WEEK_DAYS
          ? 'weekOff'
          : underStreak >= WEEK_DAYS
            ? 'weekUnder'
            : track.bestAverageAfter(QUEST_LENGTH - counted) < STRENGTH_LINE
              ? 'cantWin'
              : null;
      if (reason) {
        restartedOn = d;
        restartReason = reason;
        attemptNumber++;
        // Same rule as picking a habit: a kept-up stretch running up to
        // the restart still counts, so day 1 moves back to its start.
        // A slide (the usual cause) leaves no stretch: day 1 is tomorrow.
        const kept = keptUpRunStart(d, isDone, isExcused);
        attemptStart = kept && kept > attemptStart ? kept : addDays(d, 1);
        continue replay;
      }
    }
    break;
  }

  const endDate = endOf(attemptStart);
  const days: QuestDay[] = [];
  let doneCount = 0;
  let missedCount = 0;
  let counted = 0;
  // The day you're on: counted days before today, plus today.
  let todayNumber = QUEST_LENGTH + 1;

  for (let date = attemptStart; date <= endDate; date = addDays(date, 1)) {
    const skipped = isSkipped(date);
    if (date === today) todayNumber = counted + 1;
    if (!skipped) counted++;
    let state: QuestDayState;
    if (date > today) {
      state = vacationDates?.has(date) ? 'vacation' : winOnlyDates?.has(date) ? 'winOnly' : 'future';
    } else if (isDone(date)) {
      state = 'done';
      doneCount++;
    } else if (vacationDates?.has(date)) {
      state = 'vacation';
    } else if (winOnlyDates?.has(date)) {
      state = 'winOnly';
    } else if (date === today) {
      state = 'open';
    } else {
      state = 'missed';
      missedCount++;
    }
    days.push({ date, dayNumber: skipped ? null : counted, state });
  }
  if (today < attemptStart) todayNumber = 0;

  return {
    days,
    attemptStart,
    attemptNumber,
    restartedOn,
    restartReason,
    endDate,
    doneCount,
    missedCount,
    todayNumber,
    daysLeft: Math.max(0, QUEST_LENGTH - todayNumber),
    isOver: today > endDate,
    strength,
    earnedBadge: today > endDate && strength >= STRENGTH_LINE,
  };
}

/** Longest a quest can stretch with skipped days, as a safety stop. */
const MAX_QUEST_SPAN = QUEST_LENGTH + 366;

/** Day 60's date: the 60th day from `start` that isn't skipped. */
export function questEndAfterSkips(start: string, isSkipped: (date: string) => boolean): string {
  let counted = 0;
  let d = start;
  for (let i = 0; i < MAX_QUEST_SPAN; i++, d = addDays(d, 1)) {
    if (!isSkipped(d) && ++counted === QUEST_LENGTH) return d;
  }
  return addDays(d, -1);
}

/** Most days off allowed in any 7-day stretch for past days to count toward a quest. */
export const CREDIT_DAYS_OFF_PER_WEEK = 1;

/**
 * The start of the kept-up stretch ending on `end`: walking back from `end`
 * (inclusive, at most `maxDays` days), the run lasts until a 7-day window
 * holds more than CREDIT_DAYS_OFF_PER_WEEK days off (excused days don't
 * count). Returns the run's earliest done day, or null when there's none.
 * Used when picking a habit and when a quest restarts.
 */
export function keptUpRunStart(
  end: string,
  isDone: (date: string) => boolean,
  isExcused: (date: string) => boolean,
  maxDays = QUEST_LENGTH,
): string | null {
  let start: string | null = null;
  const misses: string[] = [];
  for (let k = 0; k < maxDays; k++) {
    const date = addDays(end, -k);
    if (isDone(date)) {
      start = date;
    } else if (!isExcused(date)) {
      misses.push(date);
      const windowMisses = misses.filter((m) => daysBetween(date, m) < 7).length;
      if (windowMisses > CREDIT_DAYS_OFF_PER_WEEK) break;
    }
  }
  return start;
}

/** Longest stretch of past days credit will scan, skipped days included. */
const CREDIT_SCAN_DAYS = QUEST_LENGTH + 120;

/**
 * Where a new quest on this habit starts, crediting what's already been
 * done, by the quest's own rules: day 1 goes back as far as a quest started
 * then would have run without a restart (no full week off, no full week
 * under 50% once reached, 50% by day 60 always in reach), with habit
 * strength carried in from history the same way. Day 1 is always a day the
 * habit was done; the run can't hold more than 60 counted days before
 * today. Walking back, the first start that would have restarted ends the
 * search. With nothing to credit, day 1 is today.
 *
 * Returns the start date and the quest laid out from it. 60 credited days
 * means it's already over and passed: picking the habit earns the badge.
 * Days a previous badge on the habit already used (through `notBefore`)
 * never count again, so the same 60 days can't earn two badges.
 */
export function creditedQuest(params: {
  today: string;
  habit: Habit;
  getRecord: (date: string) => HabitRecord | undefined;
  vacationDates?: Set<string>;
  winOnlyDates?: Set<string>;
  /** Day 60 of this habit's latest badge: days up to it already earned one and can't count again. */
  notBefore?: string;
}): { startDate: string; creditedDays: number; progress: QuestProgress } {
  const { today, habit, getRecord, vacationDates, winOnlyDates, notBefore } = params;
  const isDone = (date: string) => didParticipate(habit, getRecord(date));
  const isExcused = (date: string) => !!vacationDates?.has(date) || !!winOnlyDates?.has(date);
  const questFrom = (startDate: string) =>
    computeQuestProgress({ startDate, today, habit, getRecord, vacationDates, winOnlyDates });

  // The scan checks up to CREDIT_SCAN_DAYS starts, each a full replay; on
  // a phone that's too slow with Date math per step, so the days are laid
  // out once as arrays and replayed by index. `wouldRestart(i)` is exactly
  // computeQuestProgress's restart test for a quest starting on day i (a
  // test holds them equal).
  const span = CREDIT_SCAN_DAYS + MAINTENANCE_WINDOW_DAYS;
  const dates: string[] = [];
  for (let i = 0, d = addDays(today, -span); i <= span; i++, d = addDays(d, 1)) dates.push(d);
  const done = dates.map(isDone);
  const excused = dates.map(isExcused);
  const outcome = (i: number): DayOutcome => (done[i] ? 'done' : excused[i] ? 'excused' : 'missed');
  const wouldRestart = (start: number): boolean => {
    const track = new StrengthTrack();
    for (let i = start - MAINTENANCE_WINDOW_DAYS; i < start; i++) track.step(outcome(i));
    let reached = track.average >= STRENGTH_LINE;
    let miss = 0;
    let under = 0;
    let counted = 0;
    for (let i = start; i <= span; i++) {
      const o = outcome(i);
      if (i === span && o !== 'done') break;
      track.step(o);
      const strength = track.average;
      if (!(excused[i] && !done[i])) counted++;
      if (strength >= STRENGTH_LINE) reached = true;
      if (o !== 'excused') {
        miss = o === 'missed' ? miss + 1 : 0;
        under = reached && strength < STRENGTH_LINE ? under + 1 : 0;
      }
      if (miss >= WEEK_DAYS || under >= WEEK_DAYS || track.bestAverageAfter(QUEST_LENGTH - counted) < STRENGTH_LINE) {
        return true;
      }
      if (counted >= QUEST_LENGTH) return false;
    }
    return false;
  };

  let startDate = today;
  let counted = 0;
  for (let i = span - 1; i >= span - CREDIT_SCAN_DAYS; i--) {
    if (notBefore && dates[i] <= notBefore) break;
    if (!(excused[i] && !done[i]) && ++counted > QUEST_LENGTH) break;
    if (!done[i]) continue;
    if (wouldRestart(i)) break;
    startDate = dates[i];
  }
  const progress = questFrom(startDate);
  // Counted days only: skipped ones in the run don't use up any of the 60.
  const creditedDays = progress.isOver ? QUEST_LENGTH : Math.max(0, progress.todayNumber - 1);
  return { startDate, creditedDays, progress };
}
