import { buildMonthReportHtml, monthReportLabel, monthReportRange } from '../lib/month-pdf';
import { monthCalendarWeeks, monthCountDays } from '../lib/month-habit-stats';
import { heatmapShade } from '../lib/day-breakdown';
import type { Habit, HabitRecord, VacationDay } from '../types/habit';

const SUCCESS = { unrecorded: '#D5D8DC', recorded: '#2ECC71', double: '#F1C40F', triple: '#9B59B6' };

function habit(id: string, extra: Partial<Habit> = {}): Habit {
  return {
    id,
    userId: 'u1',
    name: `Habit ${id}`,
    abbreviation: id.toUpperCase(),
    recordingMode: 'boolean',
    tileSize: 1,
    position: { row: 0, col: 0 },
    color: '#3366CC',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

function data(records: HabitRecord[] = [], vacation: VacationDay[] = []) {
  return {
    habits: [habit('w'), habit('r', { name: 'Read <books>' })],
    recordIndex: new Map(records.map((r) => [`${r.habitId}_${r.date}`, r])),
    vacationDays: new Map(vacation.map((v) => [v.date, v])),
    winOnlyWeekends: false,
    successColors: SUCCESS,
    today: new Date(2026, 9, 28), // Wed Oct 28 2026
    scheme: 'light' as const,
  };
}

const oct = { year: 2026, month: 9, monthCount: 1, includeWeeks: false };

describe('monthReportLabel', () => {
  test('one month, same-year range, cross-year range', () => {
    expect(monthReportLabel(oct)).toBe('October 2026');
    expect(monthReportLabel({ ...oct, monthCount: 3 })).toBe('Aug – Oct 2026');
    expect(monthReportLabel({ ...oct, monthCount: 12 })).toBe('Nov 2025 – Oct 2026');
  });
});

describe('monthReportRange', () => {
  test('months only: first of the oldest month to the end of the newest', () => {
    expect(monthReportRange({ ...oct, monthCount: 3 }, data().today)).toEqual({
      startDate: '2026-08-01',
      endDate: '2026-10-31',
    });
  });

  test('weeks reach back to the Monday 3 weeks before this week (current month: anchored on today)', () => {
    // This week starts Mon Oct 26; 4 weeks back starts Mon Oct 5 — inside October.
    expect(monthReportRange({ ...oct, includeWeeks: true }, data().today)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-11-01',
    });
  });

  test('past month: weeks end with the week holding its last day', () => {
    // Feb 28 2026 is a Saturday: weeks Feb 23, 16, 9, 2 (ending Sun Mar 1).
    const range = monthReportRange({ year: 2026, month: 1, monthCount: 1, includeWeeks: true }, data().today);
    expect(range).toEqual({ startDate: '2026-02-01', endDate: '2026-03-01' });
  });
});

describe('buildMonthReportHtml', () => {
  test('single month: no month tags or dividers, escapes names', () => {
    const html = buildMonthReportHtml(data(), oct);
    expect(html).not.toContain('class="tag"');
    expect(html).not.toContain('class="divider"');
    expect(html).toContain('Read &lt;books&gt;');
    expect(html).not.toContain('Last 4 Weeks');
  });

  test('several months: a divider per month and a tag on every card', () => {
    const html = buildMonthReportHtml(data(), { ...oct, monthCount: 3 });
    expect(html.match(/class="divider"/g)).toHaveLength(3);
    // calendar + 2 habit cards per month
    expect(html.match(/class="tag"/g)).toHaveLength(9);
    expect(html.indexOf('October 2026</span>')).toBeLessThan(html.indexOf('August 2026</span>'));
  });

  test('weeks sit right after the newest month, newest week first', () => {
    const html = buildMonthReportHtml(data(), { ...oct, monthCount: 2, includeWeeks: true });
    const weeks = html.indexOf('Last 4 Weeks');
    expect(weeks).toBeGreaterThan(html.indexOf('October 2026</span>'));
    expect(weeks).toBeLessThan(html.indexOf('September 2026</span>'));
    expect(html.indexOf('Oct 26 – Nov 1')).toBeLessThan(html.indexOf('Oct 5 – Oct 11'));
  });

  test('week tiles use the success color for the tier; vacation days show their label', () => {
    const records: HabitRecord[] = [
      { id: 'x', habitId: 'w', userId: 'u1', date: '2026-10-26', value: true, recordedAt: 0 },
    ];
    const vacation: VacationDay[] = [
      { id: 'v', userId: 'u1', date: '2026-10-27', label: 'Trip', color: '#123456', createdAt: 0, updatedAt: 0 },
    ];
    const html = buildMonthReportHtml(data(records, vacation), { ...oct, includeWeeks: true });
    expect(html).toContain(`class="tile" style="background:${SUCCESS.recorded}`);
    expect(html).toContain('>Trip</div>');
  });
});

describe('theme', () => {
  test('the PDF wears the app theme: dark page, dark heatmap and grid', () => {
    const light = buildMonthReportHtml(data(), { ...oct, includeWeeks: true });
    const dark = buildMonthReportHtml({ ...data(), scheme: 'dark' }, { ...oct, includeWeeks: true });
    expect(light).toContain('--page: #FFFFFF;');
    expect(dark).toContain('--page: #151718;');
    expect(dark).toContain('background:#4A4D52'); // dark empty heatmap day
    expect(dark).toContain('background: #1C1E21;'); // dark week grid
    expect(dark).not.toContain('#D5D8DC"');
  });
});

describe('month helpers shared with the screen', () => {
  test('calendar is Monday-first and padded', () => {
    const weeks = monthCalendarWeeks(2026, 9); // Oct 1 2026 is a Thursday
    expect(weeks[0]).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks[weeks.length - 1]).toEqual([26, 27, 28, 29, 30, 31, null]);
  });

  test('current month counts through yesterday', () => {
    expect(monthCountDays(2026, 9, new Date(2026, 9, 28))).toBe(27);
    expect(monthCountDays(2026, 8, new Date(2026, 9, 28))).toBe(30);
  });

  test('heatmap shade', () => {
    expect(heatmapShade(0, '#2ECC71', '#D5D8DC')).toBe('#D5D8DC');
    expect(heatmapShade(1, '#2ECC71', '#D5D8DC')).toBe('#2ECC71FF');
  });
});
