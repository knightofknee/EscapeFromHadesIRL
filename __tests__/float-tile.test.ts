import {
  clampCenter,
  clampFloatSize,
  floatToPx,
  gridLines,
  pxToFloat,
  samePlacement,
  snapFloat,
  DEFAULT_FLOAT,
  MAX_FLOAT_SIZE,
  MIN_FLOAT_SIZE,
} from '../lib/float-tile';

// A 3×3 grid in a 300×300 container, 4pt padding and 4pt gaps: rows are
// 96pt tall at y = 4, 104, 204; tiles 96pt wide at x = 0, 100, 200 within
// each row (rows start at x = 4).
const rows = [0, 1, 2].map((r) => ({ x: 4, y: 4 + r * 100, width: 292, height: 96 }));
const tiles = rows.map(() => [0, 1, 2].map((c) => ({ x: c * 100, y: 0, width: 96, height: 96 })));
const bounds = { width: 300, height: 300 };
const lines = gridLines(rows, tiles);

describe('gridLines', () => {
  it('puts lines through the middle of the gaps', () => {
    expect(lines.ys).toEqual([102, 202]);
    expect(lines.rows[0].xs).toEqual([102, 202]);
    expect(lines.rows[0]).toMatchObject({ top: 4, bottom: 100 });
  });
  it('gives a one-tile row no vertical lines', () => {
    const l = gridLines([rows[0]], [[tiles[0][0]]]);
    expect(l.rows[0].xs).toEqual([]);
    expect(l.ys).toEqual([]);
  });
});

describe('snapFloat', () => {
  it('snaps to a vertical line of the row it is in', () => {
    const p = snapFloat({ x: 110, y: 50 }, 60, lines, bounds, 4);
    expect(p).toEqual({ x: 102, y: 50 });
  });
  it('snaps to a horizontal line', () => {
    const p = snapFloat({ x: 150, y: 110 }, 60, lines, bounds, 4);
    expect(p).toEqual({ x: 150, y: 102 });
  });
  it('snaps both at an intersection', () => {
    expect(snapFloat({ x: 195, y: 195 }, 60, lines, bounds, 4)).toEqual({ x: 202, y: 202 });
  });
  it('does not snap beyond the threshold', () => {
    expect(snapFloat({ x: 150, y: 150 }, 60, lines, bounds, 4)).toEqual({ x: 150, y: 150 });
  });
  it('uses the vertical lines of the nearest row for a center in a gap', () => {
    // y = 102 is between rows; a row with a line near x = 110 still applies.
    expect(snapFloat({ x: 110, y: 102 }, 60, lines, bounds, 4).x).toBe(102);
  });
  it('keeps the square inside the grid after snapping', () => {
    const p = snapFloat({ x: 10, y: 290 }, 100, lines, bounds, 4);
    expect(p).toEqual({ x: 54, y: 246 });
  });
});

describe('clampCenter', () => {
  it('centers when the square is bigger than the grid', () => {
    expect(clampCenter({ x: 0, y: 0 }, 400, bounds, 4)).toEqual({ x: 150, y: 150 });
  });
});

describe('size and conversion', () => {
  it('clamps size to the allowed range', () => {
    expect(clampFloatSize(0.01)).toBe(MIN_FLOAT_SIZE);
    expect(clampFloatSize(5)).toBe(MAX_FLOAT_SIZE);
    expect(clampFloatSize(0.3)).toBe(0.3);
  });
  it('round-trips placement through pixels', () => {
    const px = floatToPx(DEFAULT_FLOAT, bounds);
    expect(px.x).toBe(150);
    expect(px.y).toBe(150);
    expect(px.size).toBeCloseTo(84);
    expect(pxToFloat(px, bounds)).toEqual(DEFAULT_FLOAT);
  });
  it('rounds stored fractions to four places', () => {
    expect(pxToFloat({ x: 100, y: 100, size: 50 }, bounds)).toEqual({
      cx: 0.3333,
      cy: 0.3333,
      size: 0.1667,
    });
  });
});

describe('samePlacement', () => {
  it('compares the three fields', () => {
    expect(samePlacement(DEFAULT_FLOAT, { ...DEFAULT_FLOAT })).toBe(true);
    expect(samePlacement(DEFAULT_FLOAT, { ...DEFAULT_FLOAT, size: 0.3 })).toBe(false);
  });
  it('treats two absent placements as the same and one absent as different', () => {
    expect(samePlacement(undefined, undefined)).toBe(true);
    expect(samePlacement(DEFAULT_FLOAT, undefined)).toBe(false);
  });
});
