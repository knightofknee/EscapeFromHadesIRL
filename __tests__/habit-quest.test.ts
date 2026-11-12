import {
  QUEST_LENGTH,
  creditedQuest,
  keptUpRunStart,
  bestFinish,
  computeQuestProgress,
  didParticipate,
  questEndDate,
  quickRecordValues,
} from '@/lib/habit-quest';
import {
  DECAY,
  GAIN,
  KEPT_LINE,
  STRENGTH_LINE,
  WEEK_DAYS,
  maintenanceStatus,
  stepStrength,
  strengthOver,
} from '@/lib/habit-strength';
import { addDays } from '@/lib/date-utils';
import type { Habit, HabitRecord, RecordingMode } from '@/types/habit';

function habit(mode: RecordingMode, extra: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    userId: 'u1',
    name: 'Walk',
    abbreviation: 'W',
    recordingMode: mode,
    tileSize: 1,
    position: { row: 0, col: 0 },
    color: '#fff',
    isArchived: false,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

function rec(date: string, value: HabitRecord['value']): HabitRecord {
  return { id: `h1_${date}`, habitId: 'h1', userId: 'u1', date, value, recordedAt: 0 };
}

/** Done records for `count` days from `from`, skipping any in `skip`. */
function doneDays(from: string, count: number, skip: string[] = []): HabitRecord[] {
  const out: HabitRecord[] = [];
  for (let i = 0; i < count; i++) {
    const d = addDays(from, i);
    if (!skip.includes(d)) out.push(rec(d, true));
  }
  return out;
}

function lookup(records: HabitRecord[]) {
  const map = new Map(records.map((r) => [r.date, r]));
  return (date: string) => map.get(date);
}

describe('questEndDate', () => {
  it('day 60 is start + 59', () => {
    expect(questEndDate('2026-10-01')).toBe('2026-11-29');
  });

  it('crosses a year boundary', () => {
    expect(questEndDate('2026-12-15')).toBe('2027-02-12');
  });
});

describe('didParticipate', () => {
  it('counts every success level', () => {
    const h = habit('quad');
    expect(didParticipate(h, rec('2026-10-01', 'yes'))).toBe(true);
    expect(didParticipate(h, rec('2026-10-01', 'goal'))).toBe(true);
    expect(didParticipate(h, rec('2026-10-01', 'ideal'))).toBe(true);
    expect(didParticipate(h, rec('2026-10-01', 'no'))).toBe(false);
  });

  it('counts a value entry below its first goal', () => {
    const h = habit('value', { valueGoals: [10], valueGoalHistory: [{ from: '0000-00', goals: [10] }] });
    expect(didParticipate(h, rec('2026-10-01', '3'))).toBe(true);
    expect(didParticipate(h, rec('2026-10-01', '0'))).toBe(false);
    expect(didParticipate(h, rec('2026-10-01', ''))).toBe(false);
  });

  it('handles boolean and counter', () => {
    expect(didParticipate(habit('boolean'), rec('2026-10-01', true))).toBe(true);
    expect(didParticipate(habit('boolean'), rec('2026-10-01', false))).toBe(false);
    expect(didParticipate(habit('counter'), rec('2026-10-01', 2))).toBe(true);
    expect(didParticipate(habit('counter'), rec('2026-10-01', 0))).toBe(false);
  });

  it('no record is no participation', () => {
    expect(didParticipate(habit('boolean'), undefined)).toBe(false);
  });
});

describe('computeQuestProgress', () => {
  const start = '2026-10-01';

  it('day 1 with nothing recorded: today open, rest future', () => {
    const p = computeQuestProgress({ startDate: start, today: start, habit: habit('boolean'), getRecord: () => undefined });
    expect(p.days).toHaveLength(QUEST_LENGTH);
    expect(p.todayNumber).toBe(1);
    expect(p.days[0].state).toBe('open');
    expect(p.days[1].state).toBe('future');
    expect(p.doneCount).toBe(0);
    expect(p.missedCount).toBe(0);
    expect(p.daysLeft).toBe(59);
    expect(p.isOver).toBe(false);
  });

  it('counts done days and misses without resetting', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-05',
      habit: habit('boolean'),
      getRecord: lookup([rec('2026-10-01', true), rec('2026-10-02', true), rec('2026-10-04', true)]),
    });
    expect(p.todayNumber).toBe(5);
    expect(p.days.slice(0, 5).map((d) => d.state)).toEqual(['done', 'done', 'missed', 'done', 'open']);
    expect(p.doneCount).toBe(3);
    expect(p.missedCount).toBe(1);
    expect(p.daysLeft).toBe(55);
  });

  it('today recorded is done', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: start,
      habit: habit('boolean'),
      getRecord: lookup([rec(start, true)]),
    });
    expect(p.days[0].state).toBe('done');
    expect(p.doneCount).toBe(1);
  });

  it('vacation days are excused, but a recorded vacation day still counts', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-04',
      habit: habit('boolean'),
      getRecord: lookup([rec('2026-10-03', true)]),
      vacationDates: new Set(['2026-10-02', '2026-10-03']),
    });
    expect(p.days.slice(0, 4).map((d) => d.state)).toEqual(['missed', 'vacation', 'done', 'open']);
    expect(p.missedCount).toBe(1);
    expect(p.doneCount).toBe(1);
  });

  it('ignores records outside the 60 days', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2027-01-15',
      habit: habit('boolean'),
      getRecord: lookup([rec('2026-09-30', true), ...doneDays(start, 61)]),
    });
    expect(p.attemptNumber).toBe(1);
    expect(p.doneCount).toBe(60);
    expect(p.days[59].date).toBe('2026-11-29');
  });

  it('after day 60 the quest is over and every day is settled', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-11-30',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 60, ['2026-10-10', '2026-11-02'])),
    });
    expect(p.isOver).toBe(true);
    expect(p.todayNumber).toBe(QUEST_LENGTH + 1);
    expect(p.daysLeft).toBe(0);
    expect(p.doneCount).toBe(58);
    expect(p.missedCount).toBe(2);
    expect(p.days.some((d) => d.state === 'open' || d.state === 'future')).toBe(false);
  });

  it('day 60 itself is not over yet', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-11-29',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 59)),
    });
    expect(p.isOver).toBe(false);
    expect(p.todayNumber).toBe(60);
    expect(p.daysLeft).toBe(0);
    expect(p.days[59].state).toBe('open');
  });

  it('a deleted habit counts nothing as done', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-02',
      habit: undefined,
      getRecord: lookup([rec(start, true)]),
    });
    expect(p.doneCount).toBe(0);
    expect(p.days[0].state).toBe('missed');
  });

  it('keeps day count right across a DST change', () => {
    const p = computeQuestProgress({
      startDate: '2026-10-20',
      today: '2026-11-05',
      habit: habit('boolean'),
      getRecord: lookup(doneDays('2026-10-20', 16)),
    });
    expect(p.todayNumber).toBe(17);
    expect(new Set(p.days.map((d) => d.date)).size).toBe(QUEST_LENGTH);
  });
});

describe('habit strength model', () => {
  it('daily practice reaches 95% in 66 days (Lally median)', () => {
    let s = 0;
    for (let i = 0; i < 66; i++) s = stepStrength(s, 'done');
    expect(s).toBeCloseTo(0.95, 5);
  });

  it('no practice keeps 5% after 30 days', () => {
    let s = 1;
    for (let i = 0; i < 30; i++) s = stepStrength(s, 'missed');
    expect(s).toBeCloseTo(0.05, 5);
  });

  it('a week of nothing halves any strength', () => {
    expect(WEEK_DAYS).toBe(7);
    expect(Math.pow(1 - DECAY, WEEK_DAYS)).toBeLessThan(0.5);
    expect(Math.pow(1 - DECAY, WEEK_DAYS - 1)).toBeGreaterThan(0.5);
  });

  it('excused days change nothing', () => {
    expect(stepStrength(0.4, 'excused')).toBe(0.4);
  });

  const steady = (daysPerWeek: number) => {
    const p = daysPerWeek / 7;
    return (p * GAIN) / (p * GAIN + (1 - p) * DECAY);
  };

  it('the 50% line sits between 4 and 5 days a week held steady', () => {
    expect(steady(5)).toBeGreaterThan(STRENGTH_LINE);
    expect(steady(4)).toBeLessThan(STRENGTH_LINE);
  });

  it('the kept-up line sits between 2 and 3 days a week held steady', () => {
    expect(steady(3)).toBeGreaterThan(KEPT_LINE);
    expect(steady(2)).toBeLessThan(KEPT_LINE);
  });

  it('strengthOver replays a window from zero and counts trailing days under the line', () => {
    const r = strengthOver('2026-10-01', '2026-10-03', (d) => (d === '2026-10-02' ? 'missed' : 'done'));
    const a = stepStrength(0, 'done');
    const b = stepStrength(a, 'missed');
    const c = stepStrength(b, 'done');
    // Habit strength is the average of the daily values (fewer than 7 here).
    expect(r.strength).toBeCloseTo((a + b + c) / 3, 10);
    expect(r.daysUnder).toBe(3);
  });

  it('maintenance status: strong, kept up, then remission only after a full week under', () => {
    expect(maintenanceStatus(0.6, 0)).toBe('strong');
    expect(maintenanceStatus(0.3, 0)).toBe('kept');
    expect(maintenanceStatus(0.15, WEEK_DAYS - 1)).toBe('kept');
    expect(maintenanceStatus(0.15, WEEK_DAYS)).toBe('remission');
  });

  it('3 days a week after a badge reads as kept up; 1 day a week ends in remission', () => {
    const replay = (pattern: boolean[]) =>
      strengthOver('2026-06-01', '2026-09-28', (d) => {
        const i = Math.round((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)) - Date.UTC(2026, 5, 1)) / 864e5);
        return pattern[i % 7] ? 'done' : 'missed';
      });
    const three = replay([true, false, true, false, true, false, false]);
    expect(maintenanceStatus(three.strength, three.daysUnder)).toBe('kept');
    const one = replay([true, false, false, false, false, false, false]);
    expect(maintenanceStatus(one.strength, one.daysUnder)).toBe('remission');
    const daily = replay([true, true, true, true, true, true, true]);
    expect(maintenanceStatus(daily.strength, daily.daysUnder)).toBe('strong');
  });
});

describe('quest restarts', () => {
  const start = '2026-10-01';

  it('a week of nothing from the start restarts on day 8', () => {
    const p = computeQuestProgress({ startDate: start, today: '2026-10-09', habit: habit('boolean'), getRecord: () => undefined });
    expect(p.restartedOn).toBe('2026-10-07');
    expect(p.attemptStart).toBe('2026-10-08');
    expect(p.attemptNumber).toBe(2);
    expect(p.todayNumber).toBe(2);
  });

  it('six straight misses after building up is survivable; seven restarts', () => {
    const built = doneDays(start, 10); // Oct 1-10, then misses from Oct 11
    const six = computeQuestProgress({ startDate: start, today: '2026-10-17', habit: habit('boolean'), getRecord: lookup(built) });
    expect(six.attemptNumber).toBe(1);
    const seven = computeQuestProgress({ startDate: start, today: '2026-10-18', habit: habit('boolean'), getRecord: lookup(built) });
    expect(seven.attemptNumber).toBe(2);
    expect(seven.restartedOn).toBe('2026-10-17');
    expect(seven.attemptStart).toBe('2026-10-18');
  });

  it('an open today never counts as a miss', () => {
    const p = computeQuestProgress({ startDate: start, today: '2026-10-07', habit: habit('boolean'), getRecord: () => undefined });
    expect(p.attemptNumber).toBe(1);
  });

  it('vacation days neither build nor fade, and never restart', () => {
    const vac = new Set(Array.from({ length: 10 }, (_, i) => addDays('2026-10-04', i)));
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-15',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 3)),
      vacationDates: vac,
    });
    expect(p.attemptNumber).toBe(1);
    // 3 done, 10 vacation (no change), Oct 14 missed, Oct 15 open. The 7-day
    // average covers Oct 8-14: six unchanged vacation days and the miss.
    const s3 = 1 - Math.pow(1 - GAIN, 3);
    expect(p.strength).toBeCloseTo((6 * s3 + s3 * (1 - DECAY)) / 7, 10);
  });

  it('every other day from the start can never reach 50%, so it restarts as unwinnable', () => {
    const recs = Array.from({ length: 30 }, (_, i) => rec(addDays(start, i * 2), true));
    const p = computeQuestProgress({ startDate: start, today: '2026-11-29', habit: habit('boolean'), getRecord: lookup(recs) });
    expect(p.attemptNumber).toBeGreaterThan(1);
    expect(p.restartReason).toBe('cantWin');
  });

  it('dropping from daily to every other day eventually restarts', () => {
    const daily = doneDays(start, 30);
    const sparse = Array.from({ length: 15 }, (_, i) => rec(addDays('2026-10-31', i * 2 + 1), true));
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-11-29',
      habit: habit('boolean'),
      getRecord: lookup([...daily, ...sparse]),
    });
    expect(p.attemptNumber).toBeGreaterThan(1);
  });

  it('backfilling the missing days undoes the restart', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-09',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 8)),
    });
    expect(p.attemptNumber).toBe(1);
    expect(p.restartedOn).toBeNull();
  });
});

describe('the 50% line', () => {
  const start = '2026-10-01';

  it('one miss just above the line never restarts', () => {
    // Daily for 16 days (about 52%), one miss, then daily again.
    const recs = doneDays(start, 25, ['2026-10-17']);
    const p = computeQuestProgress({ startDate: start, today: '2026-10-26', habit: habit('boolean'), getRecord: lookup(recs) });
    expect(p.attemptNumber).toBe(1);
  });

  it('a full week under 50% after reaching it restarts, with the reason', () => {
    // Daily 20 days (about 60%), then every other day: slides under 50% and stays there.
    const daily = doneDays(start, 20);
    const sparse = Array.from({ length: 20 }, (_, i) => rec(addDays('2026-10-21', i * 2 + 1), true));
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-11-29',
      habit: habit('boolean'),
      getRecord: lookup([...daily, ...sparse]),
    });
    expect(p.attemptNumber).toBeGreaterThan(1);
    expect(p.restartReason).toBe('weekUnder');
  });

  it('a week with nothing gives the week-off reason', () => {
    const p = computeQuestProgress({ startDate: start, today: '2026-10-09', habit: habit('boolean'), getRecord: () => undefined });
    expect(p.restartReason).toBe('weekOff');
  });

  it('4 days a week cannot reach 50% by day 60: restarts the day it becomes unwinnable', () => {
    const recs = Array.from({ length: 60 }, (_, i) => i)
      .filter((i) => i % 7 < 4)
      .map((i) => rec(addDays(start, i), true));
    const p = computeQuestProgress({ startDate: start, today: '2026-11-30', habit: habit('boolean'), getRecord: lookup(recs) });
    expect(p.attemptNumber).toBe(2);
    expect(p.restartReason).toBe('cantWin');
    expect(p.isOver).toBe(false);
  });

  it('a quest that is still winnable never restarts for it', () => {
    // Nothing for 6 days, then daily: still reaches 50% well before day 60.
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-20',
      habit: habit('boolean'),
      getRecord: lookup(doneDays('2026-10-07', 14)),
    });
    expect(p.attemptNumber).toBe(1);
  });

  it('bestFinish is daily practice from here', () => {
    expect(bestFinish(0, 0)).toBe(0);
    expect(bestFinish(0.5, 0)).toBe(0.5);
    expect(bestFinish(0, 66)).toBeCloseTo(0.95, 5);
  });

  it('every finished quest earned its badge (an unwinnable one restarts first)', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-11-30',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 60, ['2026-10-10', '2026-11-02'])),
    });
    expect(p.isOver && p.earnedBadge).toBe(true);
  });

  it('near-daily practice finishes over the line and earns the badge', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-11-30',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 60, ['2026-10-10', '2026-11-02'])),
    });
    expect(p.earnedBadge).toBe(true);
  });
});

describe('credit at pick', () => {
  const today = '2026-12-15';
  const pick = (recs: HabitRecord[], vacationDates?: Set<string>) =>
    creditedQuest({ today, habit: habit('boolean'), getRecord: lookup(recs), vacationDates });
  const creditQuestWith = (recs: HabitRecord[], notBefore: string) =>
    creditedQuest({ today, habit: habit('boolean'), getRecord: lookup(recs), notBefore });

  it('no history starts today at day 1', () => {
    const c = pick([]);
    expect(c.startDate).toBe(today);
    expect(c.creditedDays).toBe(0);
    expect(c.progress.todayNumber).toBe(1);
  });

  it('25 straight days credit 25: you start on day 26', () => {
    const c = pick(doneDays(addDays(today, -25), 25));
    expect(c.creditedDays).toBe(25);
    expect(c.progress.todayNumber).toBe(26);
    expect(c.progress.attemptNumber).toBe(1);
  });

  it('one day off per week keeps the run going', () => {
    // 6 of every 7 days for the last 35 days.
    const recs = Array.from({ length: 35 }, (_, i) => i)
      .filter((i) => i % 7 !== 3)
      .map((i) => rec(addDays(today, -35 + i), true));
    expect(pick(recs).creditedDays).toBe(35);
  });

  it('two days off inside a week no longer ends the credit; the quest rules decide', () => {
    // Daily for 40 days, except two misses 3 days apart: no quest rule trips.
    const recs = doneDays(addDays(today, -40), 40, [addDays(today, -20), addDays(today, -17)]);
    expect(pick(recs).startDate).toBe(addDays(today, -40));
  });

  it('a full week off ends the credit where a quest would have restarted', () => {
    // Daily for 20 days, a week off, then daily for the last 12.
    const recs = [...doneDays(addDays(today, -40), 20), ...doneDays(addDays(today, -12), 12)];
    expect(pick(recs).startDate).toBe(addDays(today, -12));
  });

  it('vacation days never break the run', () => {
    const vac = new Set([addDays(today, -10), addDays(today, -9), addDays(today, -8)]);
    const c = pick(doneDays(addDays(today, -30), 30, [...vac]), vac);
    // The run reaches back 30 days; the 3 skipped vacation days don't count.
    expect(c.startDate).toBe(addDays(today, -30));
    expect(c.creditedDays).toBe(27);
  });

  it('58 of the last 60 days: over, passed, badge on the spot', () => {
    const recs = doneDays(addDays(today, -60), 60, [addDays(today, -40), addDays(today, -12)]);
    const c = pick(recs);
    expect(c.progress.isOver).toBe(true);
    expect(c.progress.earnedBadge).toBe(true);
    expect(c.progress.doneCount).toBe(58);
  });

  it('only counts back 60 days', () => {
    const c = pick(doneDays(addDays(today, -200), 200));
    expect(c.startDate).toBe(addDays(today, -60));
    expect(c.progress.earnedBadge).toBe(true);
  });

  it('days a previous badge used never count again', () => {
    const recs = doneDays(addDays(today, -200), 200);
    const badgeEnd = addDays(today, -10); // a badge's day 60 was 10 days ago
    const c = creditQuestWith(recs, badgeEnd);
    expect(c.startDate).toBe(addDays(today, -9));
    expect(c.creditedDays).toBe(9);
    expect(c.progress.earnedBadge).toBe(false);
  });

  it('a badge that ended yesterday leaves nothing to credit', () => {
    const c = creditQuestWith(doneDays(addDays(today, -100), 100), addDays(today, -1));
    expect(c.startDate).toBe(today);
  });

  it('missing yesterday alone does not erase the run', () => {
    const c = pick(doneDays(addDays(today, -20), 19)); // yesterday missed
    expect(c.creditedDays).toBe(20);
  });
});

describe('restart credit', () => {
  const start = '2026-10-01';

  it('a restart keeps the kept-up stretch running up to it', () => {
    // Every 3rd day for 47 days, then daily for 6, then a day off: day 60
    // can no longer reach 50% on that day off (day 54). The stretch before
    // it (one day off a week at most) reaches back to day 46.
    const sparse = Array.from({ length: 47 }, (_, i) => i).filter((i) => i % 3 === 0);
    const daily = [47, 48, 49, 50, 51, 52];
    const recs = [...sparse, ...daily].map((i) => rec(addDays(start, i), true));
    const p = computeQuestProgress({ startDate: start, today: '2026-11-25', habit: habit('boolean'), getRecord: lookup(recs) });
    expect(p.restartReason).toBe('cantWin');
    expect(p.restartedOn).toBe(addDays(start, 46));
    // Day 1 moves back into the stretch before the restart, not past it.
    expect(p.attemptStart).toBe(addDays(start, 45));
    expect(p.attemptNumber).toBe(2);
    expect(p.todayNumber).toBe(11);
  });

  it('a week with nothing leaves nothing to keep: day 1 is the next day', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-20',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 5)),
    });
    expect(p.restartReason).toBe('weekOff');
    expect(p.attemptStart).toBe(addDays(p.restartedOn!, 1));
  });

  it('keptUpRunStart: one day off a week is fine, two ends the run', () => {
    const done = new Set(['2026-10-10', '2026-10-09', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-03']);
    const isDone = (d: string) => done.has(d);
    // Misses on Oct 8 and Oct 4 are 4 days apart: the run stops at Oct 4.
    expect(keptUpRunStart('2026-10-10', isDone, () => false)).toBe('2026-10-05');
    // With Oct 8 excused, Oct 4 is the only miss in its week: the run goes on to Oct 3.
    expect(keptUpRunStart('2026-10-10', isDone, (d) => d === '2026-10-08', 8)).toBe('2026-10-03');
  });
});

describe('win-only days', () => {
  const today = '2026-10-30';
  const birthdayWeek = new Set(Array.from({ length: 8 }, (_, i) => addDays('2026-10-15', i)));

  it('a missed win-only day is ignored; a recorded one counts', () => {
    // Daily Oct 3-14, during the birthday week only Oct 16, 19, 20, then daily Oct 23-30.
    const recs = [
      ...doneDays('2026-10-03', 12),
      rec('2026-10-16', true),
      rec('2026-10-19', true),
      rec('2026-10-20', true),
      ...doneDays('2026-10-23', 8),
    ];
    // Even without the birthday week, nothing here would restart a quest.
    const without = creditedQuest({ today, habit: habit('boolean'), getRecord: lookup(recs) });
    expect(without.startDate).toBe('2026-10-03');
    expect(without.creditedDays).toBe(27);
    const withBirthday = creditedQuest({ today, habit: habit('boolean'), getRecord: lookup(recs), winOnlyDates: birthdayWeek });
    expect(withBirthday.startDate).toBe('2026-10-03');
    // 27 days back, 5 of them skipped (win-only, not recorded): 22 count.
    expect(withBirthday.creditedDays).toBe(22);
    expect(withBirthday.progress.todayNumber).toBe(23);
    expect(withBirthday.progress.doneCount).toBe(23);
    // Day 60 moves out by the 5 skipped days.
    expect(withBirthday.progress.endDate).toBe(addDays(questEndDate('2026-10-03'), 5));
    const states = withBirthday.progress.days.slice(12, 20).map((d) => d.state);
    expect(states).toEqual(['winOnly', 'done', 'winOnly', 'winOnly', 'done', 'done', 'winOnly', 'winOnly']);
    expect(withBirthday.progress.missedCount).toBe(0);
  });
});

describe('skipped days extend the quest', () => {
  const start = '2026-10-01';

  it('an unrecorded vacation day gets no day number and pushes day 60 out', () => {
    const vac = new Set(['2026-10-03']);
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-05',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 5, ['2026-10-03'])),
      vacationDates: vac,
    });
    expect(p.days.slice(0, 5).map((d) => d.dayNumber)).toEqual([1, 2, null, 3, 4]);
    expect(p.todayNumber).toBe(4);
    expect(p.endDate).toBe(addDays(questEndDate(start), 1));
    expect(p.days.filter((d) => d.dayNumber != null)).toHaveLength(60);
  });

  it('a recorded excused day counts like any other', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: '2026-10-05',
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 5)),
      vacationDates: new Set(['2026-10-03']),
    });
    expect(p.todayNumber).toBe(5);
    expect(p.endDate).toBe(questEndDate(start));
  });

  it('future excused days already push day 60 out, and show in the grid', () => {
    const p = computeQuestProgress({
      startDate: start,
      today: start,
      habit: habit('boolean'),
      getRecord: lookup([rec(start, true)]),
      winOnlyDates: new Set(['2026-10-10', '2026-10-11']),
    });
    expect(p.endDate).toBe(addDays(questEndDate(start), 2));
    expect(p.days.find((d) => d.date === '2026-10-10')?.state).toBe('winOnly');
  });
});

describe('habit strength carries in from before day 1', () => {
  const start = '2026-10-01';

  it('history before day 1 seeds the quest strength', () => {
    const history = doneDays(addDays(start, -90), 90); // daily for 90 days before
    const p = computeQuestProgress({
      startDate: start,
      today: addDays(start, 2),
      habit: habit('boolean'),
      getRecord: lookup([...history, ...doneDays(start, 3)]),
    });
    expect(p.strength).toBeGreaterThan(0.95);
    // Without history, 3 days of practice is under 15%.
    const fresh = computeQuestProgress({
      startDate: start,
      today: addDays(start, 2),
      habit: habit('boolean'),
      getRecord: lookup(doneDays(start, 3)),
    });
    expect(fresh.strength).toBeLessThan(0.15);
  });

  it('a strong history means a later slide restarts after a week under 50%', () => {
    const history = doneDays(addDays(start, -90), 90);
    // Daily for 5 days, then once a week: falls under 50% and stays there.
    const sparse = Array.from({ length: 8 }, (_, i) => rec(addDays(start, 5 + i * 7), true));
    const p = computeQuestProgress({
      startDate: start,
      today: addDays(start, 60),
      habit: habit('boolean'),
      getRecord: lookup([...history, ...doneDays(start, 5), ...sparse]),
    });
    expect(p.attemptNumber).toBeGreaterThan(1);
  });
});

describe('credit scan matches the quest replay', () => {
  it('for random histories, the credited start never restarts and one day earlier would', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const today = '2026-10-30';
    for (let trial = 0; trial < 40; trial++) {
      const rate = 0.3 + rand() * 0.7;
      const recs: HabitRecord[] = [];
      const vac = new Set<string>();
      for (let i = 1; i <= 260; i++) {
        const d = addDays(today, -i);
        const r = rand();
        if (r < rate) recs.push(rec(d, true));
        else if (r < rate + 0.03) vac.add(d);
      }
      const c = creditedQuest({ today, habit: habit('boolean'), getRecord: lookup(recs), vacationDates: vac });
      expect(c.progress.attemptNumber).toBe(1);
    }
  });
});

describe('rough weeks are tolerated (the big picture wins)', () => {
  const start = '2026-08-01';
  const end = addDays(start, 60); // the day after day 60
  /** Records from day-per-week counts: each week's first n days done. */
  const weeks = (...perWeek: number[]) =>
    perWeek.flatMap((n, w) => Array.from({ length: n }, (_, i) => rec(addDays(start, w * 7 + i), true)));
  const finish = (recs: HabitRecord[]) =>
    computeQuestProgress({ startDate: start, today: end, habit: habit('boolean'), getRecord: lookup(recs) });

  it.each([
    ['a 5-day week', [7, 7, 7, 5, 7, 7, 7, 7, 7]],
    ['two 5-day weeks in a row', [7, 7, 7, 5, 5, 7, 7, 7, 7]],
    ['5, then 6, then 5', [7, 7, 7, 5, 6, 5, 7, 7, 7]],
    ['5 days every week', [5, 5, 5, 5, 5, 5, 5, 5, 5]],
  ])('%s from a brand-new habit still earns the badge', (_name, perWeek) => {
    const p = finish(weeks(...perWeek));
    expect(p.attemptNumber).toBe(1);
    expect(p.earnedBadge).toBe(true);
  });

  it('two 3-day weeks after the habit reached 50% are a real slide and restart', () => {
    expect(finish(weeks(7, 7, 7, 7, 3, 3, 7, 7, 7)).attemptNumber).toBeGreaterThan(1);
  });

  it('a rough patch while a new habit is still climbing does not restart it', () => {
    const p = finish(weeks(7, 7, 3, 3, 7, 7, 7, 7, 7));
    expect(p.attemptNumber).toBe(1);
    expect(p.earnedBadge).toBe(true);
  });

  it('5 days a week passes on whatever weekday day 60 lands', () => {
    for (let shift = 0; shift < 7; shift++) {
      const recs = Array.from({ length: 60 }, (_, i) => i)
        .filter((i) => (i + shift) % 7 < 5)
        .map((i) => rec(addDays(start, i), true));
      expect(finish(recs).earnedBadge).toBe(true);
    }
  });
});

describe('quickRecordValues', () => {
  it('records the first level for the tap-to-record modes, like the home tile', () => {
    expect(quickRecordValues('boolean')).toEqual({ first: true, cleared: false });
    expect(quickRecordValues('triple')).toEqual({ first: 'yes', cleared: 'no' });
    expect(quickRecordValues('quad')).toEqual({ first: 'yes', cleared: 'no' });
    expect(quickRecordValues('creativeWriting')).toEqual({ first: 'yes', cleared: 'no' });
    expect(quickRecordValues('counter')).toEqual({ first: 1, cleared: 0 });
  });

  it('has nothing to write for the modes whose tile opens a modal', () => {
    expect(quickRecordValues('value')).toBeNull();
    expect(quickRecordValues('steps')).toBeNull();
    expect(quickRecordValues('meditation')).toBeNull();
    expect(quickRecordValues('phoneFree')).toBeNull();
  });
});
