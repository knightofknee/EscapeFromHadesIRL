import {
  computePhoneFreeNight,
  nightWindow,
  normalizeUsage,
  intervalsFromScreenEvents,
  intervalsFromThresholdCrossings,
  IOS_THRESHOLD_MINUTES,
  iosThresholdEventName,
  formatHoursMinutes,
  FORGIVE_MS,
  BACK_TO_SLEEP_MS,
  ABSORB_RATIO,
} from '../lib/phone-free';

// All times are local wall-clock via the Date(y, m, d, h, min) constructor,
// matching how nightWindow builds its bounds, so these pass in any timezone.
const MIN = 60 * 1000;
const H = 60 * MIN;
// Night attributed to Tue 2026-11-03: Mon 6pm → Tue noon.
const DATE = '2026-11-03';
const t = (dayOffset: number, hour: number, minute = 0) =>
  new Date(2026, 10, 2 + dayOffset, hour, minute).getTime();
const W = nightWindow(DATE);

describe('nightWindow', () => {
  it('spans 6pm the evening before to noon on the date', () => {
    expect(W.start).toBe(t(0, 18));
    expect(W.end).toBe(t(1, 12));
  });

  it('uses wall-clock bounds across the fall-back DST night', () => {
    // 2026-11-01 is fall-back Sunday; the night of Oct 31 → Nov 1 is 19h long.
    const w = nightWindow('2026-11-01');
    expect(new Date(w.start).getHours()).toBe(18);
    expect(new Date(w.end).getHours()).toBe(12);
  });
});

describe('normalizeUsage', () => {
  it('merges overlapping and touching intervals and clips to the window', () => {
    const out = normalizeUsage(
      [
        { start: t(0, 17), end: t(0, 19) }, // starts before window
        { start: t(0, 19), end: t(0, 19, 30) }, // touches
        { start: t(0, 23), end: t(0, 23, 10) },
        { start: t(0, 23, 5), end: t(0, 23, 20) }, // overlaps
        { start: t(1, 13), end: t(1, 14) }, // after window
        { start: t(1, 8), end: t(1, 8) }, // empty
      ],
      W,
    );
    expect(out).toEqual([
      { start: t(0, 18), end: t(0, 19, 30) },
      { start: t(0, 23), end: t(0, 23, 20) },
    ]);
  });
});

describe('computePhoneFreeNight', () => {
  it('finds the night between the last evening use and the first morning use', () => {
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22, 30) }, // evening on phone
      { start: t(1, 7, 0), end: t(1, 7, 40) }, // morning
    ]);
    expect(night).not.toBeNull();
    expect(night!.start).toBe(t(0, 22, 30));
    expect(night!.end).toBe(t(1, 7, 0));
    expect(night!.phoneFreeMs).toBe(8.5 * H);
    expect(night!.usageMs).toBe(0);
    expect(night!.pickups).toBe(0);
  });

  it('forgives a short pickup but subtracts its minutes', () => {
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22, 30) },
      { start: t(1, 2, 0), end: t(1, 2, 3) }, // 3-minute idea at 2am
      { start: t(1, 7, 0), end: t(1, 7, 40) },
    ]);
    expect(night!.start).toBe(t(0, 22, 30));
    expect(night!.end).toBe(t(1, 7, 0));
    expect(night!.usageMs).toBe(3 * MIN);
    expect(night!.phoneFreeMs).toBe(8.5 * H - 3 * MIN);
    expect(night!.pickups).toBe(1);
  });

  it('a pickup of exactly the forgiveness length is NOT forgiven', () => {
    // Boundary: >= FORGIVE_MS is a long pickup. With only 1h of sleep after
    // it, it ends the night rather than being absorbed.
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22, 30) },
      { start: t(1, 6, 0), end: t(1, 6, 0) + FORGIVE_MS },
      { start: t(1, 6, 30), end: t(1, 8, 0) },
    ]);
    expect(night!.end).toBe(t(1, 6, 0));
    expect(night!.pickups).toBe(0);
  });

  it('absorbs a long 3am scroll when the user goes back to sleep, subtracting it', () => {
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22, 30) },
      { start: t(1, 3, 0), end: t(1, 3, 40) }, // 40-minute scroll
      { start: t(1, 7, 0), end: t(1, 7, 40) },
    ]);
    expect(night!.start).toBe(t(0, 22, 30));
    expect(night!.end).toBe(t(1, 7, 0));
    expect(night!.usageMs).toBe(40 * MIN);
    expect(night!.phoneFreeMs).toBe(8.5 * H - 40 * MIN);
    expect(night!.pickups).toBe(1);
  });

  it('a long pickup followed by less than an hour of quiet ends the night', () => {
    // Up at 6:00 for 20 min, quiet 6:20–7:00 (40 min), then on the phone:
    // the 6:00 pickup is the morning, not a mid-night awakening.
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22, 30) },
      { start: t(1, 6, 0), end: t(1, 6, 20) },
      { start: t(1, 7, 0), end: t(1, 7, 40) },
    ]);
    expect(night!.end).toBe(t(1, 6, 0));
    expect(night!.phoneFreeMs).toBe(7.5 * H);
    expect(night!.pickups).toBe(0);
  });

  it('absorbs on the evening side too: asleep early, a long check, then asleep', () => {
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 20, 0) },
      // quiet 20:00–00:00 (4h), a 10-minute check, then asleep till 7
      { start: t(1, 0, 0), end: t(1, 0, 10) },
      { start: t(1, 7, 0), end: t(1, 7, 40) },
    ]);
    expect(night!.start).toBe(t(0, 20, 0));
    expect(night!.end).toBe(t(1, 7, 0));
    expect(night!.usageMs).toBe(10 * MIN);
    expect(night!.pickups).toBe(1);
  });

  it('does not absorb a small evening stretch before a long check (TV, then bed)', () => {
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 21, 0) },
      // quiet 21:00–22:30 (1.5h) is under half the 8h20 night that follows
      { start: t(0, 22, 30), end: t(0, 22, 40) },
      { start: t(1, 7, 0), end: t(1, 7, 40) },
    ]);
    expect(night!.start).toBe(t(0, 22, 40));
    expect(night!.pickups).toBe(0);
  });

  it('does not absorb the morning routine: alarm scroll, quiet commute, phone at work', () => {
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22, 30) },
      { start: t(1, 7, 0), end: t(1, 7, 40) }, // alarm scroll
      // quiet 7:40–9:00 (80 min, over the floor) but tiny next to 8.5h
      { start: t(1, 9, 0), end: t(1, 9, 30) }, // at work
    ]);
    expect(night!.end).toBe(t(1, 7, 0));
    expect(night!.phoneFreeMs).toBe(8.5 * H);
    expect(night!.pickups).toBe(0);
  });

  it('never extends into a quiet stretch that runs to the window edge', () => {
    // Alarm scroll at 7, then no pickup at all before noon: could be more
    // sleep, could be a phone left on the desk. Stays conservative.
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22, 30) },
      { start: t(1, 7, 0), end: t(1, 7, 40) },
    ]);
    expect(night!.start).toBe(t(0, 22, 30));
    expect(night!.end).toBe(t(1, 7, 0));
    expect(night!.pickups).toBe(0);
  });

  it('an edge-touching stretch can still BE the core when it is the longest', () => {
    // 3am scroll, then nothing until noon: the morning stretch is the
    // longest quiet block, so it is the night, and the 22:30–3:00 block
    // (comparable in size) is absorbed behind it.
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22, 30) },
      { start: t(1, 3, 0), end: t(1, 3, 40) },
    ]);
    expect(night!.start).toBe(t(0, 22, 30));
    expect(night!.end).toBe(W.end);
    expect(night!.pickups).toBe(1);
  });

  it('does not absorb a pickup longer than the sleep that follows it', () => {
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 23, 0) },
      // 4h sleep, 3h insomnia binge, 2h sleep, then up
      { start: t(1, 3, 0), end: t(1, 6, 0) },
      { start: t(1, 8, 0), end: t(1, 9, 0) },
    ]);
    expect(night!.start).toBe(t(0, 23, 0));
    expect(night!.end).toBe(t(1, 3, 0));
    expect(night!.pickups).toBe(0);
  });

  it('picks the longest quiet stretch as the core, not the first', () => {
    // Quiet 18:00–20:00 (2h), then phone till 23:00, then quiet till 7:00 (8h).
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 20), end: t(0, 23) },
      { start: t(1, 7), end: t(1, 9) },
    ]);
    expect(night!.start).toBe(t(0, 23));
    expect(night!.end).toBe(t(1, 7));
  });

  it('clamps to the window edges when the phone was down before 6pm or still down at noon', () => {
    const night = computePhoneFreeNight(DATE, []);
    expect(night!.start).toBe(W.start);
    expect(night!.end).toBe(W.end);
    expect(night!.phoneFreeMs).toBe(W.end - W.start);
  });

  it('returns null for an empty window', () => {
    expect(computePhoneFreeNight(DATE, [], { start: 5, end: 5 })).toBeNull();
  });

  it('multiple forgiven pickups all count and all subtract', () => {
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 23) },
      { start: t(1, 0, 10), end: t(1, 0, 12) },
      { start: t(1, 2, 0), end: t(1, 2, 4) },
      { start: t(1, 5, 30), end: t(1, 5, 31) },
      { start: t(1, 7), end: t(1, 9) },
    ]);
    expect(night!.pickups).toBe(3);
    expect(night!.usageMs).toBe(7 * MIN);
    expect(night!.phoneFreeMs).toBe(8 * H - 7 * MIN);
  });

  it('ABSORB_RATIO is inclusive: a back-to-sleep stretch exactly half the night absorbs', () => {
    const coreMs = 6 * H; // 22:00–4:00
    const quietMs = ABSORB_RATIO * coreMs; // 3h, ≥ BACK_TO_SLEEP_MS and ≥ the 30m pickup
    const pickupEnd = t(1, 4, 30);
    const night = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22) },
      { start: t(1, 4), end: pickupEnd },
      { start: pickupEnd + quietMs, end: t(1, 9) },
      { start: t(1, 11), end: t(1, 11, 30) }, // keeps 9–11 edge-free but irrelevant
    ]);
    expect(night!.end).toBe(pickupEnd + quietMs);
    expect(night!.pickups).toBe(1);
    expect(night!.usageMs).toBe(30 * MIN);

    // One minute under the ratio: not absorbed.
    const shorter = computePhoneFreeNight(DATE, [
      { start: t(0, 18), end: t(0, 22) },
      { start: t(1, 4), end: pickupEnd },
      { start: pickupEnd + quietMs - MIN, end: t(1, 9) },
    ]);
    expect(shorter!.end).toBe(t(1, 4));
    expect(shorter!.pickups).toBe(0);
  });

  it('BACK_TO_SLEEP_MS is the floor when the night so far is short', () => {
    // 1.5h asleep, 10-min pickup, exactly 1h quiet (≥ floor, ≥ 0.75h ratio).
    const base = [
      { start: t(0, 18), end: t(0, 23) },
      { start: t(1, 0, 30), end: t(1, 0, 40) },
    ];
    const absorbed = computePhoneFreeNight(DATE, [
      ...base,
      { start: t(1, 0, 40) + BACK_TO_SLEEP_MS, end: t(1, 12) },
    ]);
    expect(absorbed!.end).toBe(t(1, 0, 40) + BACK_TO_SLEEP_MS);
    expect(absorbed!.pickups).toBe(1);

    const notAbsorbed = computePhoneFreeNight(DATE, [
      ...base,
      { start: t(1, 0, 40) + BACK_TO_SLEEP_MS - MIN, end: t(1, 12) },
    ]);
    expect(notAbsorbed!.end).toBe(t(1, 0, 30));
    expect(notAbsorbed!.pickups).toBe(0);
  });
});

describe('intervalsFromScreenEvents', () => {
  const R0 = t(0, 12);
  const R1 = t(1, 12);

  it('pairs unlock/lock, ignoring screen-on glances when keyguard events exist', () => {
    const out = intervalsFromScreenEvents(
      [
        { type: 'screenOn', ts: t(0, 23) }, // notification glance, no unlock
        { type: 'screenOff', ts: t(0, 23, 1) },
        { type: 'unlock', ts: t(1, 2) },
        { type: 'lock', ts: t(1, 2, 3) },
        { type: 'unlock', ts: t(1, 7) },
        { type: 'screenOff', ts: t(1, 7, 30) }, // screenOff closes without a lock event
      ],
      R0,
      R1,
    );
    expect(out).toEqual([
      { start: t(1, 2), end: t(1, 2, 3) },
      { start: t(1, 7), end: t(1, 7, 30) },
    ]);
  });

  it('falls back to screen on/off when no keyguard events are reported', () => {
    const out = intervalsFromScreenEvents(
      [
        { type: 'screenOn', ts: t(0, 22) },
        { type: 'screenOff', ts: t(0, 22, 10) },
      ],
      R0,
      R1,
    );
    expect(out).toEqual([{ start: t(0, 22), end: t(0, 22, 10) }]);
  });

  it('handles use that straddles the range edges', () => {
    const out = intervalsFromScreenEvents(
      [
        { type: 'lock', ts: t(0, 12, 30) }, // was in use at range start
        { type: 'unlock', ts: t(1, 11, 50) }, // still in use at range end
      ],
      R0,
      R1,
    );
    expect(out).toEqual([
      { start: R0, end: t(0, 12, 30) },
      { start: t(1, 11, 50), end: R1 },
    ]);
  });

  it('ignores events outside the range and unsorted input', () => {
    const out = intervalsFromScreenEvents(
      [
        { type: 'lock', ts: t(1, 1, 5) },
        { type: 'unlock', ts: t(1, 1) },
        { type: 'unlock', ts: t(2, 1) }, // after range
      ],
      R0,
      R1,
    );
    expect(out).toEqual([{ start: t(1, 1), end: t(1, 1, 5) }]);
  });
});

describe('iOS threshold reconstruction', () => {
  it('registers per-minute thresholds for two hours, then every five minutes', () => {
    expect(IOS_THRESHOLD_MINUTES[0]).toBe(1);
    expect(IOS_THRESHOLD_MINUTES[119]).toBe(120);
    expect(IOS_THRESHOLD_MINUTES[120]).toBe(125);
    expect(IOS_THRESHOLD_MINUTES[IOS_THRESHOLD_MINUTES.length - 1]).toBe(360);
    // Storage keys split on "_" in the library; names must not contain it.
    expect(iosThresholdEventName(7)).toBe('m7');
  });

  it('turns crossings into slices ending at the crossing time, sized by the step', () => {
    const out = intervalsFromThresholdCrossings([
      { eventName: 'm1', at: t(1, 2, 1) },
      { eventName: 'm2', at: t(1, 2, 2) },
      { eventName: 'm125', at: t(1, 9, 0) },
      { eventName: 'intervalDidStart', at: t(0, 18) }, // not a threshold
      { eventName: 'm999', at: t(1, 9, 5) }, // not registered
    ]);
    expect(out).toEqual([
      { start: t(1, 2, 0), end: t(1, 2, 1) },
      { start: t(1, 2, 1), end: t(1, 2, 2) },
      { start: t(1, 8, 55), end: t(1, 9, 0) },
    ]);
  });

  it('a dense run of crossings merges into one pickup through normalizeUsage', () => {
    const crossings = [1, 2, 3, 4, 5, 6].map((m) => ({
      eventName: `m${m}`,
      at: t(1, 7, m),
    }));
    const merged = normalizeUsage(intervalsFromThresholdCrossings(crossings), W);
    expect(merged).toEqual([{ start: t(1, 7, 0), end: t(1, 7, 6) }]);
  });
});

describe('formatHoursMinutes', () => {
  it('formats whole minutes', () => {
    expect(formatHoursMinutes(0)).toBe('0m');
    expect(formatHoursMinutes(42 * MIN)).toBe('42m');
    expect(formatHoursMinutes(7 * H + 5 * MIN)).toBe('7h 05m');
    expect(formatHoursMinutes(8.5 * H + 29 * 1000)).toBe('8h 30m');
    expect(formatHoursMinutes(-5)).toBe('0m');
  });
});
