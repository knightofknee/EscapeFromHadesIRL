import type { Quest, QuestCategory, QuestType } from '@/types/quest';

export type QuestTemplate = {
  key: string;
  name: string;
  description: string;
  category: QuestCategory;
  questType: QuestType;
  targetDaysPerWeek: number;
  isFoundation: boolean; // walk, meditate, read — shown with a FOUNDATION badge
  // Which rolling average the quest targets ('both' if omitted — the
  // original dual-window base challenges).
  scoreWindow?: '30d' | '18mo';
  // Minimum success tier a day must reach (2 = goal, 3 = ideal).
  successLevel?: 2 | 3;
  // True = no habit linking; the quest automatically tracks every habit.
  allHabits?: boolean;
  // The "why" — philosophy and inspiration shown in the expandable details
  // section on the quest detail screen and the start flow.
  philosophy: string;
};


// Curated base set, in display order: the 3 auto-recording habit types
// (walk→steps, meditate, write→creative writing) first, then read, then
// exercise. The rest are hidden for now (commented out below) — re-enable
// by uncommenting.
export const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    key: 'walk',
    name: 'March of Orpheus',
    description: 'Walk. The body carries the soul through the underworld.',
    category: 'physical',
    questType: 'positive',
    targetDaysPerWeek: 5,
    isFoundation: true,
    philosophy:
      "Solvitur ambulando. It is solved by walking. Orpheus walked out of the underworld; the only rule was to keep moving forward.\n\nYour brain is an electric forest, shaped by how you travel through it. Every walk re-walks the path that says: I am someone who moves. Walk it often enough and it stops being a decision. It becomes a groove, a road your default self takes without being asked.\n\nThis quest doesn't care about pace or distance. Leaving the house is the win. Participation over excellence: the ferry isn't the fastest boat on the river, it's the boat that always comes.",
  },
  {
    key: 'meditate',
    name: 'Stillness of the Styx',
    description: 'Sit in silence. The river between worlds demands it.',
    category: 'mental',
    questType: 'positive',
    targetDaysPerWeek: 5,
    isFoundation: true,
    philosophy:
      "The river settles when you stop stirring it.\n\nMarcus Aurelius wrote that nowhere is there a quieter retreat than your own mind, but a retreat you never visit grows over. You don't sit to get good at sitting. You sit to watch the electric forest light up and learn, flash by flash, that you are not every thought that fires.\n\nFive sits a week isn't devotion, it's trail maintenance. The minutes don't matter; the returning matters. Each return widens the path back to stillness, until calm becomes a place you can find in the dark: your default setting, not your achievement.",
  },
  {
    key: 'write',
    name: "Muse's Quill",
    description: 'Write. The Muses reward those who give their thoughts form.',
    category: 'creative',
    questType: 'positive',
    targetDaysPerWeek: 3,
    isFoundation: false,
    philosophy:
      "Seneca ended each day in review. Writing was how he examined what the day had made of him.\n\nWriting is walking the forest with a lantern. Thought stays fog until you give it form; on the page you can finally see which paths you've actually been traveling, and prune the ones leading nowhere.\n\nThree times a week, and a single sentence counts as a session. The Muses reward arrival, not brilliance. Process over product: the page is a rep, not a monument.",
  },
  {
    key: 'read',
    name: 'Scrolls of Elysium',
    description: 'Read. The blessed dead never stopped learning.',
    category: 'mental',
    questType: 'positive',
    targetDaysPerWeek: 5,
    isFoundation: true,
    philosophy:
      "Leisure without study, Seneca said, is death: a living burial.\n\nReading seeds your forest with other people's trails. Every book is an imported path: a route through a problem that you didn't have to spend a lifetime clearing yourself. The blessed dead never stopped learning because becoming never finishes.\n\nFive visits a week. A page counts. You aren't collecting books; you're cross-pollinating the canopy, and eighteen months of pages quietly rewrites what you think about when no one is steering.",
  },
  {
    key: 'exercise',
    name: 'Trials of Tartarus',
    description: 'Train hard. Tartarus rewards only those who suffer willingly.',
    category: 'physical',
    questType: 'positive',
    targetDaysPerWeek: 4,
    isFoundation: false,
    philosophy:
      "The Stoics practiced hardship on purpose. Seneca rehearsed poverty so fortune could never ambush him. You rehearse strain so difficulty becomes familiar terrain.\n\nThe body is the trailhead of the forest. Discipline trained here generalizes: a person who can do the hard set can sit with the hard feeling, start the hard conversation, hold the long average.\n\nFour days a week, effort at any size. Showing up sore counts double. Tartarus rewards the willing: the trial is the reward, the process is the product.",
  },

  // --- Any-habit average quests (in display order) -------------------------
  // 30-day tier ladder: any level → 2nd tier → 3rd tier…
  {
    key: 'any-30d',
    name: "Charon's Crossing",
    description: 'Any habit, 4 days a week. The ferry runs in every weather.',
    category: 'custom',
    questType: 'positive',
    targetDaysPerWeek: 4,
    isFoundation: false,
    scoreWindow: '30d',
    allHabits: true,
    philosophy:
      "Charon is not the fastest boat on the river. He is the boat that always comes.\n\nThis quest asks one thing: board, four times a week. Any habit, any tier; a shaky yes counts the same as a triumphant one. Participation over excellence, because in the electric forest frequency beats intensity: a path walked often grows wider than a path sprinted once.\n\nThirty days of crossings and the oar starts to feel like part of your arm. That's the whole magic trick. There isn't another one.",
  },
  {
    key: 'tier2-30d',
    name: "Hermes' Stride",
    description: 'Any habit at 2nd-tier success, 4 days a week. Move as the messenger moves.',
    category: 'custom',
    questType: 'positive',
    targetDaysPerWeek: 4,
    isFoundation: false,
    scoreWindow: '30d',
    successLevel: 2,
    allHabits: true,
    philosophy:
      "Arrival was yesterday's bar. Hermes doesn't just make the trip; he moves like the road belongs to him.\n\nSecond-tier days are one gear past comfortable. Not heroics: increments. You never relocate a path in the forest; you widen the next groove over from the one you've already worn smooth, one footstep at a time, until the better day is simply the day you have.\n\nFour days a week at the goal tier. Any habit can carry the message.",
  },
  {
    key: 'tier3-30d',
    name: 'The Golden Bough',
    description: 'Any habit at 3rd-tier success, 4 days a week. Gold opens every gate.',
    category: 'custom',
    questType: 'positive',
    targetDaysPerWeek: 4,
    isFoundation: false,
    scoreWindow: '30d',
    successLevel: 3,
    allHabits: true,
    philosophy:
      "The bough is gold because it is rare. Demand it daily and you'll snap the branch; that's how streaks die, in a single missed perfect day.\n\nFour ideal days a week is deliberate: excellence as visitation, not residence. You sample your full expression of a habit often enough that the forest remembers the route to it, and rest enough that you can keep returning for a lifetime.\n\nThe forest doesn't need you to burn. It needs you to come back.",
  },
  // …then the same ladder held across the 18-month average.
  {
    key: 'any-18mo',
    name: "Charon's Vigil",
    description: 'Any habit, 4 days a week, held for 18 months. The vigil never ends.',
    category: 'custom',
    questType: 'positive',
    targetDaysPerWeek: 4,
    isFoundation: false,
    scoreWindow: '18mo',
    allHabits: true,
    philosophy:
      "This is the long ferry, and the whole theory of the app lives here.\n\nYour 18-month rolling average is not a scoreboard. It IS your current default setting: not what you did once, but what you usually do, which is the only thing the forest believes. A path walked four times a week for eighteen months stops being a path. It becomes a road, and roads are hard to avoid; that's the trick. Make the good thing the thing that's hard not to do.\n\nThis number moves slowly in both directions. That's not a flaw; that's what becoming measures. And impermanence works for you: the old default fades exactly as fast as the new one grows.",
  },
  {
    key: 'tier2-18mo',
    name: "Sisyphus' Resolve",
    description: "Any habit at 2nd-tier success, 4 days a week, for 18 months. The boulder doesn't rest.",
    category: 'custom',
    questType: 'positive',
    targetDaysPerWeek: 4,
    isFoundation: false,
    scoreWindow: '18mo',
    successLevel: 2,
    allHabits: true,
    philosophy:
      "One must imagine Sisyphus happy. Camus meant it. The boulder is not the punishment. The boulder is the practice.\n\nEighteen months of goal-tier days is process over product at full scale. There is no summit that stays summited; there is only today's push, done at a quality you chose on purpose. The meaning isn't waiting at the top. It's in the shoulder against the stone.\n\nWhen the average dips, you haven't failed; the boulder rolled, as boulders do. Walk back down and push. That walk down is part of the practice too.",
  },
  {
    key: 'tier3-18mo',
    name: "Heracles' Ascent",
    description: 'Any habit at 3rd-tier success, 4 days a week, for 18 months. Labors become legend.',
    category: 'custom',
    questType: 'positive',
    targetDaysPerWeek: 4,
    isFoundation: false,
    scoreWindow: '18mo',
    successLevel: 3,
    allHabits: true,
    philosophy:
      "Heracles wasn't born a god. He repped his way into Olympus, one labor at a time.\n\nWe are what we repeatedly do. Excellence, then, is not an act but a habit. Eighteen months of ideal days, four a week, is the steepest road in this app, and it changes the traveler more than it changes anything else. Hold it, and your forest's widest road runs exactly where you want your defaults to live.\n\nApotheosis is a rolling average. There is no other kind.",
  },
  // --- Hidden for now — re-enable later by uncommenting --------------------
  // {
  //   key: 'eat-right',
  //   name: 'Nectar and Ambrosia',
  //   description: 'Eat well. Even gods require proper sustenance.',
  //   category: 'wellness',
  //   questType: 'positive',
  //   targetDaysPerWeek: 6,
  //   isFoundation: false,
  // },
  // {
  //   key: 'sleep',
  //   name: 'Rest of the Shade',
  //   description: 'Sleep with discipline. The shades who rest, rise stronger.',
  //   category: 'wellness',
  //   questType: 'positive',
  //   targetDaysPerWeek: 6,
  //   isFoundation: false,
  // },
  // {
  //   key: 'hydrate',
  //   name: 'Font of Mnemosyne',
  //   description: 'Drink water. The river of memory sustains those who drink deep.',
  //   category: 'wellness',
  //   questType: 'positive',
  //   targetDaysPerWeek: 7,
  //   isFoundation: false,
  // },
];

/** The always-on all-habit templates, in display order. */
export function getVirtualQuests(): Quest[] {
  return QUEST_TEMPLATES.filter((t) => t.allHabits).map(virtualQuestForTemplate);
}

/** Resolve an `auto-<key>` route id back to its virtual quest (or null). */
export function findVirtualQuestById(id: string): Quest | null {
  const t = QUEST_TEMPLATES.find((tpl) => tpl.allHabits && `auto-${tpl.key}` === id);
  return t ? virtualQuestForTemplate(t) : null;
}

export const TEMPLATE_BY_KEY = Object.fromEntries(
  QUEST_TEMPLATES.map((t) => [t.key, t]),
) as Record<string, QuestTemplate>;

/**
 * All-habit templates are ALWAYS-ON: they track every habit automatically
 * with no Begin step and no quest doc. The quests screens synthesize a
 * virtual Quest per template (stable id `auto-<key>`) for scoring/routing.
 */
function virtualQuestForTemplate(t: QuestTemplate): Quest {
  return {
    id: `auto-${t.key}`,
    userId: '',
    templateKey: t.key,
    name: t.name,
    description: t.description,
    category: t.category,
    questType: t.questType,
    linkedHabitIds: [],
    targetDaysPerWeek: t.targetDaysPerWeek,
    successLevel: t.successLevel ?? 1,
    scoreWindow: t.scoreWindow ?? 'both',
    allHabits: true,
    status: 'active',
    activatedAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

// Philosophy shown for custom quests (no template behind them).
export const CUSTOM_QUEST_PHILOSOPHY =
  "A pact of your own drafting. Nobody assigned this, which makes it the most honest kind of quest there is.\n\nThe theory stays the same: your brain is an electric forest, and your 18-month rolling average is your default setting. Whatever you wrote on this pact, you are really voting for the person who does it without deciding to. Frequency over intensity. Participation over excellence. Process over product.\n\nKeep the terms small enough to honor on your worst week. The forest grows on footsteps, not announcements.";

// Hades-themed category display names
export const CATEGORY_NAMES: Record<QuestCategory, string> = {
  physical: 'Trials of Elysium',
  mental: 'Wisdom of the Styx',
  creative: "Muses' Forge",
  wellness: 'Balms of Lethe',
  custom: 'Pacts of the Shade',
};
