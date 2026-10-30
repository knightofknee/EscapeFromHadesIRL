import { BADGE_DESIGNS, designForNumber, numberBadges } from '../lib/badge-designs';

describe('badge designs', () => {
  it('every badge is its own design, in a fixed order', () => {
    expect(new Set(BADGE_DESIGNS.map((d) => d.name)).size).toBe(BADGE_DESIGNS.length);
    expect(designForNumber(1).name).toBe('The Laurel');
    expect(designForNumber(2).name).toBe('The Lyre');
  });

  it('cycles after the last design', () => {
    expect(designForNumber(BADGE_DESIGNS.length + 1)).toBe(BADGE_DESIGNS[0]);
    expect(designForNumber(0)).toBe(BADGE_DESIGNS[0]);
  });

  it('numbers badges by when they were earned, not list order', () => {
    const q = (id: string, finishedAt: number) => ({ id, createdAt: 0, finishedAt });
    const numbered = numberBadges([q('b', 200), q('a', 100), q('c', 300)]);
    expect(numbered.map((n) => [n.quest.id, n.number, n.design.name])).toEqual([
      ['a', 1, 'The Laurel'],
      ['b', 2, 'The Lyre'],
      ['c', 3, 'The Pomegranate'],
    ]);
  });

  it('ties never reshuffle', () => {
    const a = numberBadges([
      { id: 'y', createdAt: 5, finishedAt: 10 },
      { id: 'x', createdAt: 5, finishedAt: 10 },
    ]);
    expect(a.map((n) => n.quest.id)).toEqual(['x', 'y']);
  });
});
