// Preset "starter tasks" offered by the intro bubble picker (app/starter-setup.tsx).
// Each task creates a habit (see lib/starter-tasks.ts for the creation logic).
// Colors here are the
// PREFERRED tile color; acronyms are tried in order so collisions fall back to
// the next form (the picker/lib avoid repeats across the set and existing
// habits). `emoji` is picker-only flair — it is NOT written to the habit, so
// the tile still shows the acronym (per spec).
import type { RecordingMode } from '@/types/habit';

export type StarterCategory = 'core' | 'more';

export type StarterTask = {
  /** Stable key. */
  key: string;
  /** Habit name (also the tile name shown once showName is on). */
  label: string;
  /** Picker-only emoji (not persisted). */
  emoji: string;
  category: StarterCategory;
  recordingMode: RecordingMode;
  /** Acronym preference order; first form not already taken wins. */
  acronyms: string[];
  /** Preferred tile color (hex, from constants/grid TILE_COLORS). */
  color: string;
  stepGoals?: number[];
  meditationSessions?: number;
  meditationMinutes?: number;
  meditationIdealTotalMinutes?: number;
  /** Short case for the task, shown in the picker. */
  blurb: string;
};

// Order matters: collisions resolve in this order, so Meditate claims "M"
// before Music falls back to "Mu". Core first (the opt-out trio), then the
// opt-in pursuits.
export const STARTER_TASKS: StarterTask[] = [
  {
    key: 'walk',
    label: 'Walk',
    emoji: '🚶',
    category: 'core',
    recordingMode: 'steps',
    acronyms: ['W', 'Wk'],
    color: '#2ECC71', // green
    stepGoals: [7000, 10000, 15000],
    blurb: 'Counts your steps automatically. Leaving the house is the win. 7k / 10k / 15k mark the tiers.',
  },
  {
    key: 'meditate',
    label: 'Meditate',
    emoji: '🧘',
    category: 'core',
    recordingMode: 'meditation',
    acronyms: ['M', 'Me'],
    color: '#9B59B6', // purple
    meditationSessions: 2,
    meditationMinutes: 5,
    meditationIdealTotalMinutes: 30,
    blurb: 'Five quiet minutes a day. The returning matters more than the minutes.',
  },
  {
    key: 'read',
    label: 'Read',
    emoji: '📖',
    category: 'core',
    recordingMode: 'quad',
    acronyms: ['R', 'Re'],
    color: '#3498DB', // blue
    blurb: 'A page counts. Seed your mind with other people’s trails.',
  },
  {
    key: 'write',
    label: 'Write',
    emoji: '✍️',
    category: 'more',
    recordingMode: 'creativeWriting',
    acronyms: ['CW', 'Wr'],
    color: '#E91E63', // pink
    blurb: 'Marks itself when you save a note. A single sentence is a session.',
  },
  {
    key: 'exercise',
    label: 'Exercise',
    emoji: '🏋️',
    category: 'more',
    recordingMode: 'quad',
    acronyms: ['E', 'Ex'],
    color: '#E67E22', // orange
    blurb: 'Effort at any size. Showing up sore counts double.',
  },
  {
    key: 'yoga',
    label: 'Yoga',
    emoji: '🤸',
    category: 'more',
    recordingMode: 'quad',
    acronyms: ['Y', 'Yo'],
    color: '#1ABC9C', // teal
    blurb: 'Move and breathe. Balance is a practice, not a pose.',
  },
  {
    key: 'music',
    label: 'Music',
    emoji: '🎵',
    category: 'more',
    recordingMode: 'quad',
    acronyms: ['M', 'Mu'], // M is taken by Meditate → resolves to "Mu"
    color: '#FF9800', // amber
    blurb: 'Play or practice. Tend the craft a little at a time.',
  },
];

export const CORE_STARTER_KEYS = STARTER_TASKS.filter((t) => t.category === 'core').map((t) => t.key);
