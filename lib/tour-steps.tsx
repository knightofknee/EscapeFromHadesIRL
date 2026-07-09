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
        "Your mind is an electric forest you wander every day, and your eighteen-month average is its default setting. Those are the paths your feet take without you deciding. Escape From Hades is the game of wearing new paths until they become roads.",
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
        "The habits you just chose are here on your home screen. Tap below to add more whenever you like. Aim for small and repeatable, not perfect: participation over excellence, process over product.",
      quote: {
        text: 'The beginnings of all things are small.',
        source: 'Cicero, De Finibus',
      },
      quote2: {
        text: 'The beginning is the hardest part, celebrate!',
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
        "That faint line is all a path is at first, just a single print in the dark. The forest paths of your mind are grooves, and you vote with your feet. Each time you come back the same way it grows clearer, until it becomes your default route. What you've done for eighteen months is easier to continue than to stop. You shape your default settings.",
      quote: {
        text: 'We become just by doing just acts, temperate by doing temperate acts, brave by doing brave acts.',
        source: 'Aristotle, Nicomachean Ethics',
      },
      cta: 'On to quests ›',
    },

    // ── Quests: challenges to track (informational, over the quests tab) ──
    {
      id: 'first-quest',
      match: onQuestsHome,
      onEnter: ctx.goQuests,
      eyebrow: 'YOUR CHALLENGES',
      title: 'Quests are challenges to meet.',
      body:
        "This is the quests tab. Most challenges are already running, quietly watching your habits. You don't set them up. Come here to see how you're doing. (You can also write your own, but you don't have to.)",
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
        'Footsteps become paths, paths become roads, and roads rewrite your default. That rewrite is the escape. Hold three things and you cannot lose.',
      mantras: ['Show up small.', 'Return often.', 'Let the road rise to meet you.'],
      quote: {
        text: 'Become such as you are, having learned what that is.',
        source: 'Pindar, Pythian Odes',
      },
      cta: 'Enter the forest ›',
    },
  ];
}
