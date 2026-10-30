import { addDays } from '@/lib/date-utils';

/**
 * Habit strength: a 0..1 estimate of how automatic a habit has become,
 * following the habit-learning model in Klein et al. (2011): each day you do
 * it, strength climbs toward 1 by a fixed share of the remaining gap; each
 * day you don't, it fades by a fixed share of what's there.
 *
 *   done:    S' = S + GAIN * (1 - S)
 *   skipped: S' = S * (1 - DECAY)
 *   excused (vacation): unchanged
 *
 * The model form is published; its two rates are not settled science. They
 * are calibrated here to the best numbers available:
 * - GAIN: daily practice reaches 95% strength in 66 days, the median time to
 *   95% of peak automaticity in Lally et al. (2010, Eur J Soc Psychol). The
 *   2024 Singh et al. review found medians of 59 to 66 days.
 * - DECAY: with no practice, 95% of strength is gone in 30 days. Edgren et
 *   al. (2025, Appl Psychol Health Well-Being) found habit decay settled
 *   anywhere from 1 to 65 days, varying a lot by person; 30 sits inside it.
 * Change these and the restart and remission rules move with them.
 */
export const FORMATION_DAYS = 66;
export const DECAY_DAYS = 30;
export const GAIN = 1 - Math.pow(0.05, 1 / FORMATION_DAYS);
export const DECAY = 1 - Math.pow(0.05, 1 / DECAY_DAYS);

/**
 * One line for everything: 50% habit strength (the 7-day average). Held
 * steady, 5 days a week averages about 53% and 4 days a week about 38%, so the
 * line sits just under "most days, kept up". Science gives no cut-off here:
 * Lally found a single miss didn't matter and very inconsistent people never
 * formed the habit, but no study names a number. This is a design choice
 * read off the model, not a measured threshold.
 * - The 60-day quest restarts after a full week under the line once you've
 *   reached it, or a full week with nothing at all before then.
 * - A badge needs the line at day 60.
 * - A badged habit at or above it is "strong".
 */
export const STRENGTH_LINE = 0.5;

/**
 * After the badge, keeping a habit going takes less than building it did.
 * A badged habit at or above this is "kept up": 3 days a week settles at
 * about 26%, 2 days a week at about 16%, so the line sits near 2.5 days a
 * week. A full week under it is "in remission". Also a design choice read
 * off the model, not a measured threshold.
 */
export const KEPT_LINE = 0.2;

/**
 * "A full week": the days of nothing that halve any strength at these rates
 * (7). Used both for straight misses and for days spent under the line, so
 * one missed day just above 50% never restarts anything (Lally: a single
 * miss didn't matter).
 */
export const WEEK_DAYS = Math.ceil(Math.log(0.5) / Math.log(1 - DECAY));

/**
 * Days before today that maintenance strength replays, starting from zero.
 * Anything older weighs under half a percent on today's value at these
 * rates, so a bounded window is effectively exact.
 */
export const MAINTENANCE_WINDOW_DAYS = 120;

export type DayOutcome = 'done' | 'missed' | 'excused';

export function stepStrength(strength: number, outcome: DayOutcome): number {
  if (outcome === 'done') return strength + GAIN * (1 - strength);
  if (outcome === 'missed') return strength * (1 - DECAY);
  return strength;
}

/**
 * Days in the habit strength average. The daily value saws up on done days
 * and down on days off (steady 5 days a week swings 48% to 58% through the
 * week), so every rule and every number shown uses the average of the last
 * 7 daily values instead: steady 5 days a week averages 53% on any weekday,
 * 4 days a week 38%. Without it, whether day 60 passed depended on which
 * weekday it landed on.
 */
export const AVERAGE_DAYS = 7;

/**
 * Habit strength over time: the daily model value plus its 7-day average,
 * which is what "habit strength" means everywhere in the app.
 */
export class StrengthTrack {
  daily = 0;
  private recent: number[] = [];

  step(outcome: DayOutcome): void {
    this.daily = stepStrength(this.daily, outcome);
    this.recent.push(this.daily);
    if (this.recent.length > AVERAGE_DAYS) this.recent.shift();
  }

  /** Average of the last 7 daily values (fewer at the very start). */
  get average(): number {
    if (this.recent.length === 0) return this.daily;
    let sum = 0;
    for (const v of this.recent) sum += v;
    return sum / this.recent.length;
  }

  /** The average after `days` more days, all of them done: the best case. */
  bestAverageAfter(days: number): number {
    const keep = this.recent.slice(Math.max(0, this.recent.length - (AVERAGE_DAYS - days)));
    const added = Math.min(days, AVERAGE_DAYS);
    // Done for k days from `daily`: 1 - (1 - daily)(1 - GAIN)^k. The window
    // holds the last `added` of the `days` future values.
    let sum = 0;
    for (const v of keep) sum += v;
    for (let k = days - added + 1; k <= days; k++) sum += 1 - (1 - this.daily) * Math.pow(1 - GAIN, k);
    const n = keep.length + added;
    return n === 0 ? this.daily : sum / n;
  }
}

/**
 * Replay [from, through] (inclusive) from zero. `outcomeOn` says how each
 * date went. Returns habit strength (the 7-day average) at `through` and how
 * many days in a row (counting back from `through`, excused days skipped)
 * it has sat under `line`. Used for the maintenance status on badged habits.
 */
export function strengthOver(
  from: string,
  through: string,
  outcomeOn: (date: string) => DayOutcome,
  line = KEPT_LINE,
): { strength: number; daysUnder: number } {
  const track = new StrengthTrack();
  let daysUnder = 0;
  for (let d = from; d <= through; d = addDays(d, 1)) {
    const outcome = outcomeOn(d);
    track.step(outcome);
    if (outcome !== 'excused') daysUnder = track.average < line ? daysUnder + 1 : 0;
  }
  return { strength: track.average, daysUnder };
}

export type MaintenanceStatus = 'strong' | 'kept' | 'remission';

/**
 * How a badged habit is holding up: strong at STRENGTH_LINE or above, in
 * remission after a full week under KEPT_LINE, kept up otherwise (a dip
 * under KEPT_LINE shorter than a week doesn't count yet).
 */
export function maintenanceStatus(strength: number, daysUnderKept: number): MaintenanceStatus {
  if (daysUnderKept >= WEEK_DAYS) return 'remission';
  return strength >= STRENGTH_LINE ? 'strong' : 'kept';
}
