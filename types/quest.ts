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
  status: 'active' | 'paused';
  activatedAt: number;
  createdAt: number;
  updatedAt: number;
};
