export type QuestCategory = 'physical' | 'mental' | 'creative' | 'wellness' | 'custom';

// positive = do more of this, reduce = do less of this (bad habits, excess relaxation)
export type QuestType = 'positive' | 'reduce';

export type Quest = {
  id: string;
  userId: string;
  templateKey: string | null; // null = custom quest
  name: string;
  description: string;
  category: QuestCategory;
  questType: QuestType;
  linkedHabitIds: string[];
  targetDaysPerWeek: number; // 1-7; for reduce quests: max allowed days per week
  // For quad-type linked habits (steps/meditation/creativeWriting/quad): the
  // minimum success level a day must reach to count — 1 = basic (yes), 2 =
  // goal, 3 = ideal. Lets two quests on one habit set different bars.
  // Undefined = 1 (basic); ignored for non-quad habits.
  successLevel?: 1 | 2 | 3;
  // Which rolling average this quest targets and earns points from.
  // '30d' / '18mo' = that single window only; 'both' (or undefined, for
  // legacy quests) = the original dual-window behavior.
  scoreWindow?: '30d' | '18mo' | 'both';
  // True = the quest tracks EVERY habit automatically (no linking): a day
  // counts when ANY habit reaches the required success level. linkedHabitIds
  // stays [] for these.
  allHabits?: boolean;
  // Custom pacts only: the user's own authored "why this quest" (shown in the
  // expandable philosophy card instead of the shared generic blurb). Empty/
  // absent → falls back to CUSTOM_QUEST_PHILOSOPHY. Templates use their own
  // template.philosophy and ignore this.
  personalPactWhy?: string;
  status: 'active' | 'paused';
  activatedAt: number;
  createdAt: number;
  updatedAt: number;
};
