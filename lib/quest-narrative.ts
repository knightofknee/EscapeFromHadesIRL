import type { Quest } from '@/types/quest';

// The only QuestScore fields the narrative needs — structural so this lib
// doesn't depend on the hooks layer.
type StandingScore = { score: number; score18mo?: number };

/**
 * "Where you stand" — narrates the user's LIVE default for this quest back to
 * them in the app's voice (the electric forest: path → groove → road). Pure
 * derivation of the score the app already computes; no persistence, no new
 * field. Returns null when there's no score yet.
 *
 * The "default setting" number is the 18-month average; a 30-day-only quest
 * has no 18-month run, so it reads its 30-day score instead.
 */
export function questStandingLine(
  quest: Pick<Quest, 'scoreWindow'>,
  questScore: StandingScore | undefined,
): string | null {
  if (!questScore) return null;
  const window = quest.scoreWindow ?? 'both';
  const def = window === '30d' ? questScore.score : questScore.score18mo ?? 0;

  let line: string;
  if (def < 25) line = 'Still a faint path: walked, but not yet worn.';
  else if (def < 50) line = 'A groove is forming. The forest is starting to expect this.';
  else if (def < 75) line = 'This is becoming a road. Half your default already lives here.';
  else line = 'A road now: hard to avoid, which was always the trick.';

  // Dual-window quests: contrast the recent month against the worn road, so
  // the gap between "today's spike" and "your true average" reads in-voice.
  if (window === 'both' && (questScore.score18mo ?? 0) >= 20) {
    const gap = questScore.score - (questScore.score18mo ?? 0);
    if (gap >= 12) line += ' This month sits above it. Keep returning and the road rises to meet you.';
    else if (gap <= -12) line += ' A slow month under it; the road holds you while you walk back up.';
  }
  return line;
}

/**
 * In-voice opener for a CUSTOM pact's "why", woven from its own terms. This is
 * a starting draft the user edits — never auto-saved. Closes the canon gap
 * where every custom pact shared one generic blurb.
 */
export function suggestPactWhy(opts: {
  name: string;
  habitName?: string;
  targetDays: number;
  questType: Quest['questType'];
}): string {
  const name = opts.name.trim() || 'This pact';
  const act = opts.habitName?.trim() || 'the work';
  const cadence =
    opts.questType === 'reduce'
      ? `no more than ${opts.targetDays} day${opts.targetDays === 1 ? '' : 's'} a week`
      : `${opts.targetDays} day${opts.targetDays === 1 ? '' : 's'} a week`;

  return [
    `${name} is a pact of your own drafting. Nobody assigned it, which makes it the most honest kind of quest there is.`,
    `The terms: ${act}, ${cadence}, kept small enough to honor on your worst week. Participation over excellence; frequency over intensity.`,
    `Your brain is an electric forest, and your eighteen-month average is its default setting. Each time you keep this pact you vote for the version of you who does it without deciding to, until the path wears into a road, and the road is hard not to take. The forest grows on footsteps, not announcements.`,
  ].join('\n\n');
}
