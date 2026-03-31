import type { QuestCategory, QuestType } from '@/types/quest';

export type QuestTemplate = {
  key: string;
  name: string;
  description: string;
  category: QuestCategory;
  questType: QuestType;
  targetDaysPerWeek: number;
  isFoundation: boolean; // walk, meditate, read — extra bonus for adopting these
};

// The 3 foundation templates give the biggest score bonus when all active
export const FOUNDATION_KEYS = ['walk', 'meditate', 'read'] as const;
export type FoundationKey = (typeof FOUNDATION_KEYS)[number];

export const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    key: 'walk',
    name: 'March of Orpheus',
    description: 'Walk. The body carries the soul through the underworld.',
    category: 'physical',
    questType: 'positive',
    targetDaysPerWeek: 5,
    isFoundation: true,
  },
  {
    key: 'meditate',
    name: 'Stillness of the Styx',
    description: 'Sit in silence. The river between worlds demands it.',
    category: 'mental',
    questType: 'positive',
    targetDaysPerWeek: 5,
    isFoundation: true,
  },
  {
    key: 'read',
    name: 'Scrolls of Elysium',
    description: 'Read. The blessed dead never stopped learning.',
    category: 'mental',
    questType: 'positive',
    targetDaysPerWeek: 5,
    isFoundation: true,
  },
  {
    key: 'write',
    name: "Muse's Quill",
    description: 'Write. The Muses reward those who give their thoughts form.',
    category: 'creative',
    questType: 'positive',
    targetDaysPerWeek: 3,
    isFoundation: false,
  },
  {
    key: 'eat-right',
    name: 'Nectar and Ambrosia',
    description: 'Eat well. Even gods require proper sustenance.',
    category: 'wellness',
    questType: 'positive',
    targetDaysPerWeek: 6,
    isFoundation: false,
  },
  {
    key: 'sleep',
    name: 'Rest of the Shade',
    description: 'Sleep with discipline. The shades who rest, rise stronger.',
    category: 'wellness',
    questType: 'positive',
    targetDaysPerWeek: 6,
    isFoundation: false,
  },
  {
    key: 'exercise',
    name: 'Trials of Tartarus',
    description: 'Train hard. Tartarus rewards only those who suffer willingly.',
    category: 'physical',
    questType: 'positive',
    targetDaysPerWeek: 4,
    isFoundation: false,
  },
  {
    key: 'hydrate',
    name: 'Waters of Lethe',
    description: 'Drink water. Not from the Lethe — that erases memory.',
    category: 'wellness',
    questType: 'positive',
    targetDaysPerWeek: 7,
    isFoundation: false,
  },
];

export const TEMPLATE_BY_KEY = Object.fromEntries(
  QUEST_TEMPLATES.map((t) => [t.key, t]),
) as Record<string, QuestTemplate>;

// Hades-themed category display names
export const CATEGORY_NAMES: Record<QuestCategory, string> = {
  physical: 'Trials of Elysium',
  mental: 'Wisdom of the Styx',
  creative: "Muses' Forge",
  wellness: 'Balms of Lethe',
  custom: 'Pacts of the Shade',
};
