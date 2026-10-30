/**
 * The 60-day badges, in the order they're earned. Every badge is its own
 * design, preselected, never random: your 1st badge (on any habit) is
 * always The Laurel, your 2nd The Lyre, and so on, cycling after the last.
 * Embroidered-patch colors, kept muted so a badge sits quietly on a tile.
 *
 * Shapes and emblems are drawn on a 100 x 100 canvas. Emblems are stroked
 * in the thread color (round caps), sized to read at 20 px.
 */

export type BadgeShape = 'circle' | 'shield' | 'hexagon';

export type BadgeDesign = {
  name: string;
  shape: BadgeShape;
  /** Rolled edge, field, and thread (stitching + emblem). */
  edge: string;
  field: string;
  thread: string;
  /** Stroked path data for the emblem. */
  emblem: string;
};

export const SHAPE_PATHS: Record<BadgeShape, string> = {
  circle: 'M50 2 A48 48 0 1 0 50 98 A48 48 0 1 0 50 2 Z',
  shield: 'M50 3 L91 15 L88 55 Q80 84 50 97 Q20 84 12 55 L9 15 Z',
  hexagon: 'M50 3 L91 26.5 L91 73.5 L50 97 L9 73.5 L9 26.5 Z',
};

export const BADGE_DESIGNS: BadgeDesign[] = [
  {
    name: 'The Laurel',
    shape: 'circle',
    edge: '#22392A',
    field: '#3E6B48',
    thread: '#D9C27A',
    emblem:
      'M40 72 Q28 52 40 30 M38 62 L29 58 M36 52 L27 46 M37 42 L30 35 M60 72 Q72 52 60 30 M62 62 L71 58 M64 52 L73 46 M63 42 L70 35',
  },
  {
    name: 'The Lyre',
    shape: 'shield',
    edge: '#2F2042',
    field: '#5B3F7A',
    thread: '#E8D9A8',
    emblem: 'M36 30 Q30 56 41 68 L59 68 Q70 56 64 30 M37 37 L63 37 M46 37 L46 68 M54 37 L54 68',
  },
  {
    name: 'The Pomegranate',
    shape: 'hexagon',
    edge: '#3E141C',
    field: '#7A2E3A',
    thread: '#F2C6A0',
    emblem: 'M34 56 A16 16 0 1 0 66 56 A16 16 0 1 0 34 56 M43 41 L45 32 L50 37 L55 32 L57 41',
  },
  {
    name: 'The Flame',
    shape: 'circle',
    edge: '#40200C',
    field: '#8A4A1E',
    thread: '#FFD27A',
    emblem: 'M50 27 C61 40 67 49 63 60 C60 70 40 70 37 60 C34 50 44 46 46 38 C48 45 53 47 50 27 Z',
  },
  {
    name: 'The Trident',
    shape: 'shield',
    edge: '#0E2C35',
    field: '#1F5A6B',
    thread: '#BFE8F0',
    emblem: 'M50 29 L50 72 M37 31 L37 43 Q37 51 50 51 Q63 51 63 43 L63 31 M43 72 L57 72',
  },
  {
    name: 'The Sun',
    shape: 'hexagon',
    edge: '#43320C',
    field: '#8A6A1E',
    thread: '#FFF1B8',
    emblem:
      'M40 50 A10 10 0 1 0 60 50 A10 10 0 1 0 40 50 M50 25 L50 33 M50 67 L50 75 M25 50 L33 50 M67 50 L75 50 M32 32 L38 38 M62 62 L68 68 M68 32 L62 38 M32 68 L38 62',
  },
  {
    name: 'The Styx',
    shape: 'circle',
    edge: '#10243A',
    field: '#244A6E',
    thread: '#9FD3F0',
    emblem:
      'M27 40 Q33 33 39 40 Q45 47 51 40 Q57 33 63 40 Q69 47 73 41 M27 52 Q33 45 39 52 Q45 59 51 52 Q57 45 63 52 Q69 59 73 53 M27 64 Q33 57 39 64 Q45 71 51 64 Q57 57 63 64 Q69 71 73 65',
  },
  {
    name: 'The Boulder',
    shape: 'shield',
    edge: '#2C2722',
    field: '#5A5248',
    thread: '#E6DCCB',
    emblem: 'M26 70 L74 42 M37 47 A10 10 0 1 0 57 47 A10 10 0 1 0 37 47',
  },
  {
    name: 'The Key',
    shape: 'hexagon',
    edge: '#1E1E30',
    field: '#3D3D5C',
    thread: '#D8C27A',
    emblem: 'M28 50 A9 9 0 1 0 46 50 A9 9 0 1 0 28 50 M46 50 L73 50 M65 50 L65 59 M72 50 L72 57',
  },
  {
    name: 'The Column',
    shape: 'circle',
    edge: '#35332E',
    field: '#6E6A60',
    thread: '#F5F1E6',
    emblem: 'M36 31 L64 31 M34 70 L66 70 M42 36 L42 65 M50 36 L50 65 M58 36 L58 65',
  },
  {
    name: 'The Wing',
    shape: 'shield',
    edge: '#162F2D',
    field: '#2E5E5A',
    thread: '#E9F5F2',
    emblem: 'M28 62 Q38 30 73 33 Q63 40 67 44 Q57 46 61 50 Q51 52 53 56 Q43 58 28 62 Z',
  },
  {
    name: 'The Star',
    shape: 'hexagon',
    edge: '#241430',
    field: '#4A2A5E',
    thread: '#FFE08A',
    emblem: 'M50 27 L56 43 L73 44 L60 54 L64 71 L50 62 L36 71 L40 54 L27 44 L44 43 Z',
  },
];

/** The design for your nth badge (1-based), cycling after the last. */
export function designForNumber(n: number): BadgeDesign {
  const i = (((Math.max(1, Math.floor(n)) - 1) % BADGE_DESIGNS.length) + BADGE_DESIGNS.length) % BADGE_DESIGNS.length;
  return BADGE_DESIGNS[i];
}

export type NumberedBadge<Q> = { quest: Q; number: number; design: BadgeDesign };

/**
 * Number earned badges in the order they were earned (finishedAt, then
 * createdAt, then id, so ties never reshuffle). Quests passed in must
 * already be the ones that earned a badge.
 */
export function numberBadges<Q extends { id: string; finishedAt?: number; createdAt: number }>(
  earned: Q[],
): NumberedBadge<Q>[] {
  return [...earned]
    .sort(
      (a, b) =>
        (a.finishedAt ?? a.createdAt) - (b.finishedAt ?? b.createdAt) ||
        a.createdAt - b.createdAt ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((quest, i) => ({ quest, number: i + 1, design: designForNumber(i + 1) }));
}
