/**
 * The Genesis tour — a brand-new wanderer's first descent. Unlike bekin8's
 * free-roam coach-marks, every "do it" step is TASK-GATED: the Next button
 * stays dark until the highlighted task is actually done (a habit lit, a pact
 * sworn). EFH-IRL is a game, not a form — the tour teaches the world's three
 * mantras and frames the climb out of Hades while it walks you through it.
 *
 * The voice is the app's own (see lib/quest-narrative.ts): your mind is an
 * electric forest, your eighteen-month average is its default setting, and
 * the forest grows on footsteps, not announcements — path → groove → road.
 * The quotes are real Greek/Roman classics, re-lit through that forest.
 */

/** What the gate reads — the live counts the tour watches for completion. */
export type TaskState = { habits: number; quests: number };

export type TourQuote = {
  text: string;
  source: string;
  /** A new light on the classic — the line reframed through the electric forest. */
  gloss?: string;
  /** Accent bar color. Defaults to the flame accent; set to set a quote apart
   *  (e.g. the celebratory blue Carl quote). */
  accent?: string;
};

export type TourStep = {
  /** Stable id (analytics / screen reactions). */
  id: string;
  /** Registered target key to spotlight. Omit for a centered, no-target beat. */
  target?: string;
  eyebrow?: string;
  title: string;
  body: string;
  quote?: TourQuote;
  /** Optional second quote, rendered beneath the first (own accent bar). */
  quote2?: TourQuote;
  /** The three world-mantras, listed on the closing beat. */
  mantras?: string[];
  /** CTA label once the step is cleared (gate met, or no gate). */
  cta?: string;
  /** CTA label shown while the gate is unmet — reads as the instruction. */
  ctaLocked?: string;
  /**
   * Task gate. While this returns false the Next button is DISABLED — the
   * wanderer must complete the highlighted task before the tour continues.
   * Omit for read-only beats (always advanceable).
   */
  gate?: (s: TaskState) => boolean;
  /** Taps inside the spotlight hole pass through to the real element. */
  interactive?: boolean;
  /** Force the callout slot; otherwise auto from the target's position. */
  placement?: 'top' | 'low';
  /**
   * Only render the spotlight while these segments are showing, so the
   * dimmer doesn't cover the create screen the wanderer navigates INTO.
   * Omit for centered beats (shown over any screen — the backdrop is full).
   */
  match?: (segments: string[]) => boolean;
  /** One-shot side effect on entering the step (navigation). */
  onEnter?: () => void;
};

export type GenesisCtx = {
  goHabits: () => void;
  goQuests: () => void;
};

// Celebratory blue for Carl's quote — set apart from the classical (flame) ones.
const CARL_BLUE = '#5B8DD9';

const onHabitsHome = (s: string[]) =>
  s[0] === '(tabs)' && s[1] === '(habits)' && s.length <= 2;
const onQuestsHome = (s: string[]) =>
  s[0] === '(tabs)' && s[1] === '(quests)' && s.length <= 2;

export function buildGenesisTour(ctx: GenesisCtx): TourStep[] {
  return [
    // ── The descent ──────────────────────────────────────────────────────
    {
      id: 'welcome',
      eyebrow: 'THE DESCENT',
      title: 'Welcome to the underworld.',
      body:
        "Hades is life on autopilot, the days that happen to you instead of the days you choose. Nobody escapes it in one heroic leap. You walk out, footstep by footstep, in a better direction. You've chosen your first habits. This short tour shows you where everything lives.",
      quote: {
        text: 'The soul becomes dyed with the color of its thoughts.',
        source: 'Marcus Aurelius, Meditations',
      },
      cta: 'Begin the climb ›',
      onEnter: ctx.goHabits,
    },

    // ── Your habits live here (spotlight the add button) ─────────────────
    {
      id: 'first-habit',
      target: 'add-first-habit',
      interactive: true,
      match: onHabitsHome,
      onEnter: ctx.goHabits,
      eyebrow: 'YOUR HABITS',
      title: 'This is home. Your habits live here.',
      body:
        "Each tile is one habit. Tap it on the days you show up, that's the whole ritual. Add more anytime with the button below. Keep them small and repeatable, not perfect: participation over excellence, process over product.",
      quote: {
        text: 'The beginnings of all things are small.',
        source: 'Cicero, De Finibus',
      },
      quote2: {
        text: 'The first steps are the hardest, celebrate your wins!',
        source: 'Carl',
        accent: CARL_BLUE,
      },
      // Pre-met once starter-setup created a habit; still guards a skipped setup.
      gate: (s) => s.habits > 0,
      ctaLocked: 'Add a habit to continue',
    },

    // ── A path appears (read-only beat) ──────────────────────────────────
    {
      id: 'habit-planted',
      eyebrow: 'A PATH APPEARS',
      title: 'One footstep, recorded.',
      body:
        "In the electric forest of your mind, a habit begins as a single footprint. Walk the same ground tomorrow and a path appears. Keep returning and the path deepens into a road your feet take without being asked. About eighteen months of walking makes it your default setting. Every tap here is one of those footsteps.",
      quote: {
        text: 'We become just by doing just acts, temperate by doing temperate acts, brave by doing brave acts.',
        source: 'Aristotle, Nicomachean Ethics',
      },
      cta: 'What counts as a win? ›',
    },

    // ── The three levels (the quad philosophy, read-only beat) ───────────
    {
      id: 'three-levels',
      eyebrow: 'THE THREE LEVELS',
      title: 'Showing up is Level 1. It matters most.',
      body:
        "Many habits here score a day at one of three levels, and they are not equal. Level 1 is participation: you showed up, even just a little. That is the level that builds the road, and it outranks everything else. Level 2 is your daily goal, the bar for a solid day. Level 3 is the ideal: what would a very successful day look like? Reach for 3 when the current is with you. On the hard days, take 1 and call it a win, because it is one.",
      mantras: [
        'Participate. Show up, even a little.',
        'Daily goal. A solid day.',
        'Ideal. Your very best day.',
      ],
      quote: {
        text: 'If you add a little to a little, and do this often, soon that little will become great.',
        source: 'Hesiod, Works and Days',
        gloss:
          'The forest never asks for a march. One small footstep, taken often, is what becomes the road.',
      },
      cta: 'One more trick ›',
    },

    // ── Swipe between days (spotlights the date header) ──────────────────
    {
      id: 'swipe-days',
      target: 'day-header',
      match: onHabitsHome,
      onEnter: ctx.goHabits,
      eyebrow: 'THE RIVER OF DAYS',
      title: 'Swipe the grid to walk between days.',
      body:
        "This date is where you're standing. Swipe the grid to the right to step back a day, left to come forward. Forgot to record last night's win? Slide back and tap it in, footsteps still count when you leave them late. You always return to today on your next visit.",
      quote: {
        text: 'Nothing is ours, except time.',
        source: 'Seneca, Letters from a Stoic',
        gloss:
          'The days behind you are not gone, they are ground you walked. Step back and mark the path where you actually left it.',
      },
      cta: 'On to quests ›',
    },

    // ── Quests: challenges to track (spotlights the quests tab in the nav) ──
    {
      id: 'first-quest',
      target: 'quests-tab',
      placement: 'top',
      match: onQuestsHome,
      onEnter: ctx.goQuests,
      eyebrow: 'YOUR CHALLENGES',
      title: 'Quests are challenges to meet.',
      body:
        "Quests live under this tab, highlighted below in the nav bar. They run themselves, quietly keeping score from the habits you already record. There's nothing to set up and nothing to maintain. Visit when you want to see where you stand, and write your own if you ever want more.",
      quote: {
        text: 'Fire is the test of gold; adversity, of strong men.',
        source: 'Seneca, On Providence',
      },
      cta: 'Got it ›',
    },

    // ── The long ascent (closing — lands back on home) ───────────────────
    {
      id: 'ascent',
      // Close the tour on the home screen, not on quests.
      onEnter: ctx.goHabits,
      eyebrow: 'THE LONG ASCENT',
      title: 'This is the whole game.',
      body:
        "Tap your habits daily, let the quests keep score, and let time do the heavy lifting. The road out of Hades isn't steep, it's just long. Hold three things and you cannot lose.",
      mantras: ['Show up small.', 'Return often.', 'Let the road rise to meet you.'],
      quote: {
        text: 'Become such as you are, having learned what that is.',
        source: 'Pindar, Pythian Odes',
      },
      cta: 'Enter the forest ›',
    },
  ];
}
