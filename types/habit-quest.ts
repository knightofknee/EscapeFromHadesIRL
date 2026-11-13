/**
 * The 60-day quest: one habit at a time, 60 days at a time. Its own
 * collection (`habitQuests`), unrelated to the scored quests in types/quest.ts.
 *
 * Day 1 is `startDate`. Restarts are derived from records (habit strength
 * collapsing, see lib/habit-quest), never written; on finish, startDate is
 * rewritten to the completed attempt's day 1.
 */
export type HabitQuest = {
  id: string;
  userId: string;
  habitId: string;
  /** Snapshot at start, so the card and history still read if the habit is renamed away or deleted. */
  habitName: string;
  habitColor: string;
  /** YYYY-MM-DD, day 1. */
  startDate: string;
  status: 'active' | 'finished';
  /** Frozen on finish: days recorded out of 60. */
  daysDone?: number;
  /** Frozen on finish: day 60's date (later than startDate + 59 when days were skipped). */
  endDate?: string;
  /** Frozen on finish: habit strength (0..1) on day 60. See lib/habit-strength. */
  finalStrength?: number;
  finishedAt?: number;
  /** Picked when its last 60 days already passed: badge earned on the spot, no quest run. */
  passedAtStart?: boolean;
  /**
   * 2 is Level Two: only goal-or-better days count, on a habit that already
   * has a badge; finishing it upgrades that badge. Absent is 1, the 60-day
   * quest. One active quest per level at a time.
   */
  level?: 1 | 2;
  createdAt: number;
  updatedAt: number;
};
