import { formatDate, parseDate } from '@/lib/date-utils';
import type { Chore } from '@/types/chore';

export const CHORES_COLLECTION = 'chores';

/** Completion dates kept per chore (enough history for the detail sheet). */
export const CHORE_HISTORY_CAP = 30;

/**
 * Where a chore stands today:
 * - late: more days have passed than the frequency allows (red)
 * - soon: due today or inside the "nearly due" window (yellow)
 * - fresh: done recently (green)
 * - never: no completion logged yet (gray, its own section so a fresh set of
 *   starter chores doesn't paint the whole list yellow)
 * - done: a one-time task that's been checked off
 */
export type ChoreState = 'late' | 'soon' | 'never' | 'fresh' | 'done';

export type ChoreStatus = {
  state: ChoreState;
  /** Days since the last completion; null when never done. */
  daysSince: number | null;
  /** Days until due (negative = late); null when never done, or a task that's done. */
  dueIn: number | null;
  /** daysSince / frequency, for ordering inside a section. */
  ratio: number;
};

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

/**
 * The "nearly due" window: the last quarter of the interval, in whole days.
 * Daily → 0 (yellow only on the day it's due), weekly → 1, monthly → 7,
 * yearly → 91.
 */
export function soonWindow(frequencyDays: number): number {
  return Math.floor(Math.max(1, frequencyDays) * 0.25);
}

export function isTask(chore: Pick<Chore, 'kind'>): boolean {
  return chore.kind === 'once';
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
  const state: ChoreState = dueIn < 0 ? 'late' : dueIn <= Math.max(1, soonWindow(span)) ? 'soon' : 'fresh';
  return { state, daysSince: null, dueIn, ratio: (span - dueIn) / span };
}

export function choreStatus(chore: StatusInput, today: string): ChoreStatus {
  if (isTask(chore)) return taskStatus(chore, today);
  const last = chore.completions[0];
  const freq = Math.max(1, chore.frequencyDays);
  if (!last) return { state: 'never', daysSince: null, dueIn: null, ratio: 0 };
  // A logged future date (clock skew) reads as done today.
  const daysSince = Math.max(0, daysBetween(last, today));
  const dueIn = freq - daysSince;
  const state: ChoreState = dueIn < 0 ? 'late' : dueIn <= soonWindow(freq) ? 'soon' : 'fresh';
  return { state, daysSince, dueIn, ratio: daysSince / freq };
}

/** Section order on screen: action items first. */
export const CHORE_STATE_ORDER: ChoreState[] = ['late', 'soon', 'never', 'fresh', 'done'];

/**
 * Urgency order: late (most overdue relative to its frequency first), then
 * due soon (soonest first), then never logged (by name), then up to date
 * (soonest due first), then finished tasks (most recently done first). Ties
 * break by name so the list is stable.
 */
export function sortChores(chores: Chore[], today: string): { chore: Chore; status: ChoreStatus }[] {
  const rank = (s: ChoreState) => CHORE_STATE_ORDER.indexOf(s);
  return chores
    .map((chore) => ({ chore, status: choreStatus(chore, today) }))
    .sort((a, b) => {
      const r = rank(a.status.state) - rank(b.status.state);
      if (r !== 0) return r;
      let d = 0;
      if (a.status.state === 'late') d = b.status.ratio - a.status.ratio;
      else if (a.status.state === 'done') d = (a.status.daysSince ?? 0) - (b.status.daysSince ?? 0);
      else if (a.status.state !== 'never') d = (a.status.dueIn ?? 0) - (b.status.dueIn ?? 0);
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

/** "Daily", "Weekly", "Every 2 weeks", "Monthly", "Every 10 days"... */
export function formatFrequency(days: number): string {
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

/** The status pill: "3 days late", "Due today", "Due in 2 weeks", "Done today". */
export function formatDue(status: ChoreStatus): string {
  if (status.state === 'done') return `Done ${formatSince(status.daysSince ?? 0).toLowerCase()}`;
  if (status.dueIn == null) return 'Not logged yet';
  if (status.daysSince === 0) return 'Done today';
  if (status.dueIn < 0) return `${span(-status.dueIn)} late`;
  if (status.dueIn === 0) return 'Due today';
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
