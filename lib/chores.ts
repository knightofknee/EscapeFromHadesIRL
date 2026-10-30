import { formatDate, parseDate } from '@/lib/date-utils';
import type { Chore } from '@/types/chore';

export const CHORES_COLLECTION = 'chores';

/** Completion dates kept per chore (enough history for the detail sheet). */
export const CHORE_HISTORY_CAP = 30;

/**
 * Where a chore stands today:
 * - overdue: a week or more past due (red)
 * - due: due today or past due by less than a week (gold: on the docket,
 *   an opportunity rather than a failure; lateness isn't emphasized)
 * - soon: inside the "nearly due" window before the due day (blue)
 * - fresh: done recently (green)
 * - done: a one-time task that's been checked off
 *
 * A recurring chore that's never been logged counts from the day it was
 * created, as if it had just been done then (no "not logged yet" state).
 */
export type ChoreState = 'overdue' | 'due' | 'soon' | 'fresh' | 'done';

/** Days past due when due (gold) turns overdue (red). */
export const OVERDUE_DAYS = 7;
/** Days past due before a gold pill says how long it's been. */
export const PAST_DUE_MARKER_DAYS = 3;

/** On the docket: due today or past due (gold or red). */
export function isPastDue(state: ChoreState): boolean {
  return state === 'due' || state === 'overdue';
}

function dueState(dueIn: number): ChoreState {
  return -dueIn >= OVERDUE_DAYS ? 'overdue' : 'due';
}

export type ChoreStatus = {
  state: ChoreState;
  /** A "Whenever" chore: no due date, just how long it's been. */
  unscheduled?: boolean;
  /** Days since the last logged completion; null when never logged. */
  daysSince: number | null;
  /** Days until due (negative = late); null for a task that's done. */
  dueIn: number | null;
  /** daysSince / frequency, for ordering inside a section. */
  ratio: number;
};

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/** The blue "nearly due" stretch is at least this many days. */
const MIN_SOON_DAYS = 2;

/**
 * The "nearly due" window in whole days before the due day: the last
 * quarter of the interval, but at least MIN_SOON_DAYS, and always leaving
 * at least one green day after it's done. Daily → 0 (no blue), every 2 days
 * → 1, every 3 days → 2, weekly → 2, monthly → 7, yearly → 91.
 */
export function soonWindow(frequencyDays: number): number {
  const freq = Math.max(1, frequencyDays);
  return Math.min(freq - 1, Math.max(MIN_SOON_DAYS, Math.floor(freq * 0.25)));
}

export function isTask(chore: Pick<Chore, 'kind'>): boolean {
  return chore.kind === 'once';
}

/** frequencyDays for a "Whenever" chore: tracked by time since, never due. */
export const UNSCHEDULED = 0;

/** A recurring chore with no frequency: always green, shows how long it's been. */
export function isUnscheduled(chore: Pick<Chore, 'kind' | 'frequencyDays'>): boolean {
  return !isTask(chore) && chore.frequencyDays <= UNSCHEDULED;
}

type StatusInput = Pick<Chore, 'completions' | 'frequencyDays'> &
  Partial<Pick<Chore, 'kind' | 'dueDate' | 'createdAt'>>;

/**
 * One-time task: done once any completion is logged; otherwise judged by its
 * due date. "Soon" is the last quarter of the time it was given (created to
 * due), at least the day before, so it reads like a recurring chore.
 */
function taskStatus(chore: StatusInput, today: string): ChoreStatus {
  const done = chore.completions[0];
  if (done) return { state: 'done', daysSince: Math.max(0, daysBetween(done, today)), dueIn: null, ratio: 0 };
  const due = chore.dueDate ?? today;
  const dueIn = daysBetween(today, due);
  const created = chore.createdAt ? formatDate(new Date(chore.createdAt)) : today;
  const span = Math.max(1, daysBetween(created, due));
  const state: ChoreState =
    dueIn <= 0 ? dueState(dueIn) : dueIn <= Math.max(MIN_SOON_DAYS, Math.floor(span * 0.25)) ? 'soon' : 'fresh';
  return { state, daysSince: null, dueIn, ratio: (span - dueIn) / span };
}

export function choreStatus(chore: StatusInput, today: string): ChoreStatus {
  if (isTask(chore)) return taskStatus(chore, today);
  const last = chore.completions[0];
  if (isUnscheduled(chore)) {
    const daysSince = last ? Math.max(0, daysBetween(last, today)) : null;
    return { state: 'fresh', unscheduled: true, daysSince, dueIn: null, ratio: 0 };
  }
  const freq = Math.max(1, chore.frequencyDays);
  // Never logged: the clock starts the day it was created.
  const base = last ?? (chore.createdAt ? formatDate(new Date(chore.createdAt)) : today);
  // A logged future date (clock skew) reads as done today.
  const elapsed = Math.max(0, daysBetween(base, today));
  const dueIn = freq - elapsed;
  const state: ChoreState = dueIn <= 0 ? dueState(dueIn) : dueIn <= soonWindow(freq) ? 'soon' : 'fresh';
  return { state, daysSince: last ? elapsed : null, dueIn, ratio: elapsed / freq };
}

/**
 * How many chores and tasks need attention today, split the way the tab
 * bubbles show them: gold `due` (on the docket) and red `overdue` (a week
 * or more late). Done tasks and "Whenever" chores never count.
 */
export function countDue(chores: StatusInput[], today: string): { due: number; overdue: number } {
  let due = 0;
  let overdue = 0;
  for (const chore of chores) {
    const { state } = choreStatus(chore, today);
    if (state === 'due') due++;
    else if (state === 'overdue') overdue++;
  }
  return { due, overdue };
}

/**
 * Screen sections, in order. One-time tasks and recurring chores stay apart
 * everywhere; late items of each kind lead so the most overdue things are
 * the first thing seen:
 *   late tasks, late chores, open tasks (by due date), chores, done tasks.
 */
export type ChoreSection = 'dueTasks' | 'dueChores' | 'tasks' | 'chores' | 'done';
export const CHORE_SECTION_ORDER: ChoreSection[] = ['dueTasks', 'dueChores', 'tasks', 'chores', 'done'];

export function choreSection(chore: Pick<Chore, 'kind'>, status: ChoreStatus): ChoreSection {
  const task = isTask(chore);
  if (status.state === 'done') return 'done';
  if (isPastDue(status.state)) return task ? 'dueTasks' : 'dueChores';
  return task ? 'tasks' : 'chores';
}

export type SortedChore = { chore: Chore; status: ChoreStatus; section: ChoreSection };

/**
 * Section order (above), then inside each section: most overdue first
 * (tasks by days late, chores relative to their frequency), soonest due
 * first, finished tasks most recently done first. "Whenever" chores go after
 * the scheduled ones, longest since first (never done last). Ties break by
 * name so the list is stable.
 */
export function sortChores(chores: Chore[], today: string): SortedChore[] {
  const rank = (s: ChoreSection) => CHORE_SECTION_ORDER.indexOf(s);
  return chores
    .map((chore) => {
      const status = choreStatus(chore, today);
      return { chore, status, section: choreSection(chore, status) };
    })
    .sort((a, b) => {
      const r = rank(a.section) - rank(b.section);
      if (r !== 0) return r;
      let d = 0;
      const ua = !!a.status.unscheduled;
      const ub = !!b.status.unscheduled;
      if (ua !== ub) d = ua ? 1 : -1;
      else if (ua) d = (b.status.daysSince ?? -1) - (a.status.daysSince ?? -1);
      else if (a.section === 'dueChores') d = b.status.ratio - a.status.ratio;
      else if (a.section === 'done') d = (a.status.daysSince ?? 0) - (b.status.daysSince ?? 0);
      else d = (a.status.dueIn ?? 0) - (b.status.dueIn ?? 0);
      return d !== 0 ? d : a.chore.name.localeCompare(b.chore.name);
    });
}

/** Add a completion date: deduped, newest first, capped. */
export function addCompletion(completions: string[], date: string): string[] {
  const next = [date, ...completions.filter((d) => d !== date)];
  next.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return next.slice(0, CHORE_HISTORY_CAP);
}

export function removeCompletion(completions: string[], date: string): string[] {
  return completions.filter((d) => d !== date);
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "Daily", "Weekly", "Every 2 weeks", "Monthly", "Every 10 days", "Whenever"... */
export function formatFrequency(days: number): string {
  if (days <= UNSCHEDULED) return 'Whenever';
  const named: Record<number, string> = {
    1: 'Daily',
    7: 'Weekly',
    14: 'Every 2 weeks',
    30: 'Monthly',
    60: 'Every 2 months',
    90: 'Every 3 months',
    180: 'Every 6 months',
    182: 'Every 6 months',
    183: 'Every 6 months',
  };
  if (named[days]) return named[days];
  // Whole years, leap days included (3652 = 10 years, 2557 = 7 years).
  if (days >= 365) {
    const years = Math.round(days / 365.25);
    if (Math.abs(days - years * 365.25) <= 1) return years === 1 ? 'Yearly' : `Every ${years} years`;
  }
  if (days >= 60 && days % 30 === 0) return `Every ${days / 30} months`;
  if (days % 7 === 0) return `Every ${days / 7} weeks`;
  return `Every ${days} days`;
}

/** Rough span: days under two weeks, then weeks, months, years. */
function span(n: number): string {
  if (n < 14) return plural(n, 'day');
  if (n < 60) return plural(Math.floor(n / 7), 'week');
  if (n < 365) return plural(Math.round(n / 30), 'month');
  return plural(Math.round(n / 365), 'year');
}

/** "Today", "Yesterday", "5 days ago", "3 weeks ago". */
export function formatSince(daysSince: number): string {
  if (daysSince <= 0) return 'Today';
  if (daysSince === 1) return 'Yesterday';
  return `${span(daysSince)} ago`;
}

/**
 * The status pill, the one place the timing lives: "Due in 3 days",
 * "Due tomorrow", "Due today", "Due" (1-2 days past), "Due 4 days ago"
 * (gold, from PAST_DUE_MARKER_DAYS), "Overdue by 11 days" (red), "Done today".
 * A "Whenever" chore just says how long it's been: "Yesterday", "5 days ago".
 */
export function formatDue(status: ChoreStatus): string {
  if (status.state === 'done') return `Done ${formatSince(status.daysSince ?? 0).toLowerCase()}`;
  if (status.unscheduled) {
    if (status.daysSince == null) return 'Not done yet';
    return status.daysSince === 0 ? 'Done today' : formatSince(status.daysSince);
  }
  if (status.dueIn == null) return '';
  if (status.daysSince === 0) return 'Done today';
  const over = -status.dueIn;
  if (status.state === 'overdue') return `Overdue by ${span(over)}`;
  if (status.dueIn === 0) return 'Due today';
  if (over > 0) return over >= PAST_DUE_MARKER_DAYS ? `Due ${span(over)} ago` : 'Due';
  if (status.dueIn === 1) return 'Due tomorrow';
  return `Due in ${span(status.dueIn)}`;
}

/** Frequency choices offered in the editor. */
export const FREQUENCY_PRESETS = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365] as const;

/** Due-date choices offered in the task editor, in days from today. */
export const DUE_PRESETS = [0, 1, 3, 7, 14, 30] as const;

/** "Today", "Tomorrow", "In 3 days", "In a week", "In 2 weeks", "In a month". */
export function formatDuePreset(days: number): string {
  const named: Record<number, string> = { 0: 'Today', 1: 'Tomorrow', 7: 'In a week', 30: 'In a month' };
  if (named[days]) return named[days];
  if (days % 7 === 0) return `In ${days / 7} weeks`;
  return `In ${days} days`;
}

/** "Oct 12" (adds the year when it isn't this year's). */
export function formatShortDate(date: string, today: string): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return parseDate(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
