import type { ChoreState } from '@/lib/chores';

/** Status colors: green up to date, yellow due soon, red late, gray never logged. */
export const CHORE_STATE_COLORS: Record<ChoreState, string> = {
  fresh: '#2ECC71',
  soon: '#F1C40F',
  late: '#E74C3C',
  never: '#8E959C',
};

/** Pill text on the tinted pill: yellow needs a darker ink on light backgrounds. */
export function choreInkColor(state: ChoreState, scheme: 'light' | 'dark'): string {
  if (state === 'soon') return scheme === 'dark' ? '#F4D03F' : '#9A7D0A';
  if (state === 'fresh') return scheme === 'dark' ? '#58D68D' : '#1E8449';
  if (state === 'late') return scheme === 'dark' ? '#F1948A' : '#C0392B';
  return scheme === 'dark' ? '#AEB4BA' : '#626A72';
}

export const CHORE_SECTION_TITLES: Record<ChoreState, string> = {
  late: 'Late',
  soon: 'Due soon',
  never: 'Not logged yet',
  fresh: 'Up to date',
};
