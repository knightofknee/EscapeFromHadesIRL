/**
 * Bonus quotes, surfaced one at a time. Every QUOTE_EVERY_N_DAYS distinct
 * days of app use (counted after setup, i.e. once the account has habits) the
 * NEXT quote in this list is shown, once. Sequential, not random, so everyone
 * sees the same quotes in the same order. If the list runs out it loops back
 * to the start, so keep adding quotes faster than one per ten days of real
 * use. These are a small gift of useful words, NOT an achievement system —
 * present them bare (see earned-quote-modal), never with congratulation copy.
 */
export type EarnedQuote = {
  text: string;
  source: string;
};

/** Distinct active days between quotes. */
export const QUOTE_EVERY_N_DAYS = 10;

export const EARNED_QUOTES: EarnedQuote[] = [
  {
    text: 'If you add a little to a little, and do this often, soon that little will become great.',
    source: 'Hesiod, Works and Days',
  },
  {
    text: 'Dripping water hollows out stone, not through force but through persistence.',
    source: 'Ovid, Epistulae ex Ponto',
  },
  {
    text: 'The impediment to action advances action. What stands in the way becomes the way.',
    source: 'Marcus Aurelius, Meditations',
  },
  {
    text: 'How long are you going to wait before you demand the best for yourself?',
    source: 'Epictetus, Enchiridion',
  },
  {
    text: 'You must build up your life action by action, and be content if each one achieves its goal as far as it can.',
    source: 'Marcus Aurelius, Meditations',
  },
  {
    text: 'Nothing great is created suddenly, any more than a bunch of grapes or a fig.',
    source: 'Epictetus, Discourses',
  },
  {
    text: 'Difficulties strengthen the mind, as labor does the body.',
    source: 'Seneca',
  },
  {
    text: 'Waste no more time arguing about what a good man should be. Be one.',
    source: 'Marcus Aurelius, Meditations',
  },
  {
    text: 'First say to yourself what you would be; and then do what you have to do.',
    source: 'Epictetus, Discourses',
  },
  {
    text: 'Man conquers the world by conquering himself.',
    source: 'Zeno of Citium',
  },
];
