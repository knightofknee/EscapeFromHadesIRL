import { buildStatsHtml } from '../lib/stats-pdf';
import type { Habit } from '../types/habit';

function makeHabit(): Habit {
  return {
    id: 'h1',
    userId: 'u1',
    name: 'Walk',
    abbreviation: 'W',
    recordingMode: 'boolean',
    tileSize: 1,
    position: { row: 0, col: 0 },
    color: '#3366ff',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('buildStatsHtml months window', () => {
  const base = { habits: [makeHabit()], recordIndex: new Map(), vacationSet: new Set<string>(), winOnlyWeekends: false, scheme: 'dark' as const };

  test('defaults to the 18-month window', () => {
    expect(buildStatsHtml(base)).toContain('18-month rolling view');
  });

  test('states the chosen window', () => {
    const html = buildStatsHtml({ ...base, displayMonths: 24 });
    expect(html).toContain('24-month rolling view');
    expect(html).not.toContain('18-month rolling view');
  });
});
