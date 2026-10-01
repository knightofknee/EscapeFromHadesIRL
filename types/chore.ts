/**
 * A recurring chore tracked by time since it was last done (wash sheets,
 * cat litter, call mom). No streaks or tiers: the only question is "how long
 * has it been, compared to how often it should happen?"
 */
export type Chore = {
  id: string;
  userId: string;
  name: string;
  /** One emoji shown on the row. */
  emoji: string;
  /** Ideal days between completions (1 = daily, 7 = weekly, 30 = monthly). */
  frequencyDays: number;
  /**
   * Days it was done (YYYY-MM-DD), newest first, deduped, capped at
   * CHORE_HISTORY_CAP. completions[0] is "last done". Kept on the doc (not a
   * subcollection): it's small and the list needs it on every render.
   */
  completions: string[];
  createdAt: number;
  updatedAt: number;
};
