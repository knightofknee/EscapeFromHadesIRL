/**
 * recurring: repeats every frequencyDays (the original chore).
 * once: a one-time task with a due date; checking it off moves it to Done.
 */
export type ChoreKind = 'recurring' | 'once';

/**
 * A chore tracked by time since it was last done (wash sheets, cat litter,
 * call mom), or a one-time task tracked against its due date. No streaks or
 * tiers: the only question is "how long has it been, compared to how often
 * it should happen?" (or "is it done yet, and is it late?").
 */
export type Chore = {
  id: string;
  userId: string;
  /** Absent on docs written before one-time tasks existed: recurring. */
  kind?: ChoreKind;
  name: string;
  /** One emoji shown on the row. Empty for most one-time tasks (no icon). */
  emoji: string;
  /** Ideal days between completions (1 = daily, 7 = weekly, 30 = monthly). Unused for one-time tasks. */
  frequencyDays: number;
  /** One-time tasks: optional details. */
  description?: string;
  /** One-time tasks: due date (YYYY-MM-DD). */
  dueDate?: string;
  /**
   * Days it was done (YYYY-MM-DD), newest first, deduped, capped at
   * CHORE_HISTORY_CAP. completions[0] is "last done". A one-time task is
   * done when this is non-empty. Kept on the doc (not a
   * subcollection): it's small and the list needs it on every render.
   */
  completions: string[];
  createdAt: number;
  updatedAt: number;
};
