import { buildMonthReportHtml, monthReportLabel, monthReportRange } from '../lib/month-pdf';
import { weekStartOf, weekdayOrder } from '../lib/date-utils';
import {
  cellAmount,
  focusDayRatio,
  maxMonthPage,
  minMonthPage,
  monthPage,
  rangeCalendarWeeks,
  reportPages,
  trailingMonthStart,
} from '../lib/month-habit-stats';
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
    today: new Date(2026, 9, 28),
    scheme: 'light' as const,
  };
}

const today = new Date(2026, 9, 28); // Wed Oct 28 2026
// What the screen has selected: the page on show and the pages before it.
const opts = (offset: number, count = 1, includeWeeks = false) => ({
  pages: reportPages(offset, count, today),
  includeWeeks,
});
const oct = opts(1); // the current month, October

describe('monthReportLabel', () => {
  test('a whole calendar month keeps its name; past months show the span with the year', () => {
    expect(monthReportLabel(oct)).toBe('October 2026');
    expect(monthReportLabel(opts(0))).toBe('Sep 29 – Oct 28, 2026');
    expect(monthReportLabel(opts(0, 3))).toBe('Jul 29 – Oct 28, 2026');
    expect(monthReportLabel(opts(0, 12))).toBe('Oct 29, 2025 – Oct 28, 2026');
  });
});

describe('monthReportRange', () => {
  test('pages only: the oldest page start to the newest page end', () => {
    expect(monthReportRange(opts(0, 3), today)).toEqual({ startDate: '2026-07-29', endDate: '2026-10-28' });
  });

  test('weeks reach back to the Monday 3 weeks before this week (anchored on today)', () => {
    // This week starts Mon Oct 26; 4 weeks back starts Mon Oct 5, inside the page.
    expect(monthReportRange({ ...oct, includeWeeks: true }, today)).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-11-01',
    });
  });

  test('an older page: weeks end with the week holding its last day', () => {
    // Page -1 is Aug 29 – Sep 28; Sep 28 2026 is a Monday: weeks Sep 28, 21, 14, 7.
    expect(monthReportRange(opts(-1, 1, true), today)).toEqual({ startDate: '2026-08-29', endDate: '2026-10-04' });
  });
});

describe('buildMonthReportHtml', () => {
  test('single page: no tags or dividers, escapes names', () => {
    const html = buildMonthReportHtml(data(), oct);
    expect(html).not.toContain('class="tag"');
    expect(html).not.toContain('class="divider"');
    expect(html).toContain('Read &lt;books&gt;');
    expect(html).not.toContain('Last 4 Weeks');
  });

  test('the calendar covers the page on screen, not a calendar month', () => {
    const html = buildMonthReportHtml(data(), opts(0));
    // Sep 29 – Oct 28: 30 days, and Oct 29 is not on it.
    expect(html.match(/<div class="day" style=/g)).toHaveLength(30);
  });

  test('several pages: a divider per page and a tag on every card', () => {
    const html = buildMonthReportHtml(data(), opts(0, 3));
    expect(html.match(/class="divider"/g)).toHaveLength(3);
    // calendar + 2 habit cards per page
    expect(html.match(/class="tag"/g)).toHaveLength(9);
    expect(html.indexOf('Sep 29 – Oct 28</span>')).toBeLessThan(html.indexOf('Jul 29 – Aug 28</span>'));
  });

  test('weeks sit right after the newest page, newest week first', () => {
    const html = buildMonthReportHtml(data(), opts(0, 2, true));
    const weeks = html.indexOf('Last 4 Weeks');
    expect(weeks).toBeGreaterThan(html.indexOf('Sep 29 – Oct 28</span>'));
    expect(weeks).toBeLessThan(html.indexOf('Aug 29 – Sep 28</span>'));
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

  test('one habit picked: only that habit, in its color, with each day\'s amount', () => {
    const steps = habit('s', { name: 'Walk', recordingMode: 'steps', color: '#FF8800', stepGoals: [5000, 8000, 10000] });
    const records: HabitRecord[] = [
      { id: 'y', habitId: 's', userId: 'u1', date: '2026-10-20', value: 'ideal', steps: 12_345, recordedAt: 0 },
    ];
    const d = { ...data(records), habits: [...data().habits, steps], focus: steps };
    const html = buildMonthReportHtml(d, { ...oct, includeWeeks: true });
    expect(html).toContain('<div class="meta">Walk ·');
    expect(html).not.toContain('Read &lt;books&gt;');
    expect(html).not.toContain('>R</div>'); // no other habit's week tiles
    expect(html).toContain('background:#FF8800FF">20<b class="amt-day">');
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
  test('one habit: shade is how far it got, out of its top level; amounts fit a cell', () => {
    const q = habit('q', { recordingMode: 'quad' });
    const rec = (value: HabitRecord['value']): HabitRecord => ({ id: 'z', habitId: 'q', userId: 'u1', date: '2026-10-20', value, recordedAt: 0 });
    expect(focusDayRatio(q, undefined, '2026-10-20', false)).toBe(0);
    expect(focusDayRatio(q, rec('ideal'), '2026-10-20', false)).toBe(1);
    expect(focusDayRatio(q, rec('yes'), '2026-10-20', false)).toBeCloseTo(1 / 3);
    const v = habit('v', { recordingMode: 'value' });
    expect(cellAmount(v, { ...rec('12'), habitId: 'v' })).toBe('12');
    expect(cellAmount(v, { ...rec('123456'), habitId: 'v' })).toBe('123k');
    expect(cellAmount(q, rec('goal'))).toBeNull();
  });

  test('heatmap shade', () => {
    expect(heatmapShade(0, '#2ECC71', '#D5D8DC')).toBe('#D5D8DC');
    expect(heatmapShade(1, '#2ECC71', '#D5D8DC')).toBe('#2ECC71FF');
  });
});

describe('month pages', () => {
  test('page 0 is the past month ending today, counted through yesterday', () => {
    const p = monthPage(0, new Date(2026, 10, 4)); // Nov 4
    expect(p.kind).toBe('trailing');
    expect(p.startDate).toBe('2026-10-05');
    expect(p.endDate).toBe('2026-11-04');
    expect(p.dates).toHaveLength(31);
    expect(p.countDates[p.countDates.length - 1]).toBe('2026-11-03');
    expect(p.label).toBe('Oct 5 – Nov 4');
  });

  test('page 1 is the current month so far', () => {
    const today = new Date(2026, 10, 4);
    const cur = monthPage(1, today);
    expect(cur.kind).toBe('calendar');
    expect([cur.startDate, cur.endDate]).toEqual(['2026-11-01', '2026-11-30']);
    expect(cur.countDates).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(cur.label).toBe('November 2026');
  });

  test('pages back are past months lined up with today, not named months', () => {
    const today = new Date(2026, 10, 4); // Nov 4
    const prev = monthPage(-1, today);
    expect(prev.kind).toBe('trailing');
    expect([prev.startDate, prev.endDate]).toEqual(['2026-09-05', '2026-10-04']);
    expect(prev.countDates).toHaveLength(30);
    expect(prev.label).toBe('Sep 5 – Oct 4');
    expect(monthPage(-2, today).label).toBe('Aug 5 – Sep 4');
    // Contiguous: each page ends the day before the next one starts.
    for (let o = -1; o >= -14; o--) {
      const a = monthPage(o, today);
      const b = monthPage(o + 1, today);
      const dayAfter = new Date(a.endDate + 'T00:00:00');
      dayAfter.setDate(dayAfter.getDate() + 1);
      const iso = `${dayAfter.getFullYear()}-${String(dayAfter.getMonth() + 1).padStart(2, '0')}-${String(dayAfter.getDate()).padStart(2, '0')}`;
      expect(iso).toBe(b.startDate);
    }
  });

  test('the back button stops at the page holding the first habit', () => {
    const today = new Date(2026, 10, 4);
    expect(minMonthPage(today, null)).toBe(0);
    expect(minMonthPage(today, '2026-10-20')).toBe(0);
    expect(minMonthPage(today, '2026-10-04')).toBe(-1);
    expect(minMonthPage(today, '2026-09-05')).toBe(-1);
    expect(minMonthPage(today, '2026-09-04')).toBe(-2);
  });

  test('the forward button stops at the current month', () => {
    expect(maxMonthPage(new Date(2026, 10, 4))).toBe(1);
    // Nov 30: the past month is Oct 31 – Nov 30, still a day more than November.
    expect(maxMonthPage(new Date(2026, 10, 30))).toBe(1);
    // Mar 31: February is short, so the past month IS March; nothing lies forward.
    expect(maxMonthPage(new Date(2026, 2, 31))).toBe(0);
    expect(monthPage(0, new Date(2026, 2, 31)).label).toBe('March 2026');
  });

  test('past month start clamps to short months', () => {
    expect(trailingMonthStart(new Date(2026, 2, 31))).toBe('2026-03-01'); // Mar 31 → Feb has 28 days
    expect(trailingMonthStart(new Date(2026, 0, 15))).toBe('2025-12-16');
  });

  test('range calendar pads the first and last weeks', () => {
    const weeks = rangeCalendarWeeks(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    // Oct 29 2026 is a Thursday.
    expect(weeks[0]).toEqual([null, null, null, '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weeks[1]).toEqual(['2026-11-02', null, null, null, null, null, null]);
    expect(rangeCalendarWeeks([])).toEqual([]);
  });
});

describe('week start setting', () => {
  test('weekStartOf honours Monday and Sunday starts', () => {
    // 2026-11-05 is a Thursday.
    expect(weekStartOf('2026-11-05', 1)).toBe('2026-11-02');
    expect(weekStartOf('2026-11-05', 0)).toBe('2026-11-01');
    expect(weekStartOf('2026-11-01', 1)).toBe('2026-10-26'); // Sunday belongs to the Monday-start week before
    expect(weekStartOf('2026-11-01', 0)).toBe('2026-11-01');
  });

  test('weekday order and calendar grid follow the setting', () => {
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Oct 1 2026 is a Thursday: Sunday-first pads four, Monday-first pads three.
    const oct1 = monthPage(1, new Date(2026, 9, 5)).dates;
    expect(rangeCalendarWeeks(oct1, 0)[0].slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']);
    expect(rangeCalendarWeeks(oct1, 1)[0].slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
  });
});
