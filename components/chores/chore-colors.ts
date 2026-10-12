import type { ChoreSection, ChoreState } from '@/lib/chores';

/**
 * Status colors: green up to date (and done tasks), blue coming up, gold
 * due (Hades' buried treasure: an opportunity, not a failure), red only a
 * week or more past due.
 */
export const CHORE_STATE_COLORS: Record<ChoreState, string> = {
  fresh: '#2ECC71',
  soon: '#3498DB',
  due: '#C9A227',
  overdue: '#E74C3C',
  done: '#2ECC71',
};

/** Pill text on the tinted pill, readable on both backgrounds. */
export function choreInkColor(state: ChoreState, scheme: 'light' | 'dark'): string {
  if (state === 'soon') return scheme === 'dark' ? '#5DADE2' : '#1F618D';
  if (state === 'fresh' || state === 'done') return scheme === 'dark' ? '#58D68D' : '#1E8449';
  if (state === 'due') return scheme === 'dark' ? '#E2C25A' : '#7D6416';
  return scheme === 'dark' ? '#F1948A' : '#C0392B';
}

export const CHORE_SECTION_TITLES: Record<ChoreSection, string> = {
  dueTasks: 'Tasks due',
  dueChores: 'Chores due',
  tasks: 'Tasks',
  chores: 'Chores',
  done: 'Done',
};

/** Section header dot: gold for the due sections, green for done, none otherwise. */
export function choreSectionColor(section: ChoreSection): string | null {
  if (section === 'dueTasks' || section === 'dueChores') return CHORE_STATE_COLORS.due;
  if (section === 'done') return CHORE_STATE_COLORS.done;
  return null;
}
