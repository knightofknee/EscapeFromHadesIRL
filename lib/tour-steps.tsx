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

    // ── The first ember (TASK: create a habit) ───────────────────────────
    {
      id: 'first-habit',
      target: 'add-first-habit',
      interactive: true,
      match: onHabitsHome,
      onEnter: ctx.goHabits,
      eyebrow: 'THE FIRST EMBER',
      title: 'Light a single habit.',
      body:
        "Don't reach for perfection. Choose incremental goals. Value process over product, participation over excellence. Success will follow. Tap below to plant your first.",
      quote: {
        text: 'The beginnings of all things are small.',
        source: 'Cicero, De Finibus',
      },
      gate: (s) => s.habits > 0,
      ctaLocked: 'Plant a habit to continue',
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

    // ── Swear a pact (TASK: create a quest) ──────────────────────────────
    {
      id: 'first-quest',
      // Spotlights the first unstarted challenge's Begin stub — the one-tap
      // path. If every challenge is already begun the target won't resolve,
      // but then the gate (quests > 0) is already met and the tour degrades
      // to a centered beat with Next available.
      target: 'begin-challenge',
      interactive: true,
      match: onQuestsHome,
      onEnter: ctx.goQuests,
      placement: 'low',
      eyebrow: 'SWEAR A PACT',
      title: 'Bind that habit to a quest.',
      body:
        'A habit is the footstep; a quest is the road you swear to walk. Begin a challenge and link the habit you just lit, and the climb scores itself, shore by shore: the Styx, the Asphodel Meadows, Elysium, the Gates of Olympus. (A quest needs a habit, which is why we lit one first.)',
      quote: {
        text: 'First say to yourself what you would be; and then do what you have to do.',
        source: 'Epictetus, Discourses',
        gloss: 'Name the road out loud. Then it has somewhere to lead.',
      },
      gate: (s) => s.quests > 0,
      ctaLocked: 'Begin a quest to continue',
      cta: 'The pact is sworn ›',
    },

    // ── The long ascent (closing) ────────────────────────────────────────
    {
      id: 'ascent',
      eyebrow: 'THE LONG ASCENT',
      title: 'This is the whole game.',
      body:
        'Footsteps become paths, paths become roads, and roads rewrite your eighteen-month default, and that rewrite is the escape. Hesiod said the gods set sweat before the gates of excellence; the long climb is the reward. Hold three things and you cannot lose.',
      mantras: ['Show up small.', 'Return often.', 'Let the road rise to meet you.'],
      quote: {
        text: 'Become such as you are, having learned what that is.',
        source: 'Pindar, Pythian Odes',
        gloss: 'The way out of Hades and the way into yourself are the same road.',
      },
      cta: 'Enter the forest ›',
    },
  ];
}
