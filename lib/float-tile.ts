import type { FloatPlacement } from '@/types/habit';

/**
 * Geometry for tiles that float above the grid. Pure: the grid measures
 * its rows and tiles, this turns those into snap lines and keeps the float
 * inside the grid. All pixel math is in the grid container's coordinates.
 */

/** Where a new float lands: centered, a bit smaller than a 3-column cell. */
export const DEFAULT_FLOAT: FloatPlacement = { cx: 0.5, cy: 0.5, size: 0.28 };
/** Side as a fraction of grid width. */
export const MIN_FLOAT_SIZE = 0.14;
export const MAX_FLOAT_SIZE = 0.6;
/** How close (pt) the center has to be to a line to snap onto it. */
export const SNAP_THRESHOLD = 18;

/** One measured grid row: its vertical span and the x of every vertical
 *  line between its tiles (none for a single-tile row). */
export type GridRowLines = { top: number; bottom: number; xs: number[] };

export type GridLines = {
  rows: GridRowLines[];
  /** Horizontal lines between rows, top to bottom. */
  ys: number[];
};

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Snap lines from measured layout. `rows` are the row views' rects in the
 * container; `tiles[r]` the tiles' rects within row r, left to right. Lines
 * run through the middle of the gap between neighbours, so a float centered
 * on one straddles both tiles equally.
 */
export function gridLines(rows: Rect[], tiles: Rect[][]): GridLines {
  const rowLines: GridRowLines[] = rows.map((row, r) => {
    const cells = tiles[r] ?? [];
    const xs: number[] = [];
    for (let i = 0; i + 1 < cells.length; i++) {
      const right = row.x + cells[i].x + cells[i].width;
      const nextLeft = row.x + cells[i + 1].x;
      xs.push((right + nextLeft) / 2);
    }
    return { top: row.y, bottom: row.y + row.height, xs };
  });
  const ys: number[] = [];
  for (let i = 0; i + 1 < rows.length; i++) {
    ys.push((rows[i].y + rows[i].height + rows[i + 1].y) / 2);
  }
  return { rows: rowLines, ys };
}

function nearest(value: number, candidates: number[], threshold: number): number {
  let best = value;
  let bestDist = threshold;
  for (const c of candidates) {
    const d = Math.abs(c - value);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** The row whose vertical span holds y, else the closest one. */
function rowAt(lines: GridLines, y: number): GridRowLines | undefined {
  let best: GridRowLines | undefined;
  let bestDist = Infinity;
  for (const row of lines.rows) {
    const d = y < row.top ? row.top - y : y > row.bottom ? y - row.bottom : 0;
    if (d < bestDist) {
      best = row;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Snap a dropped center onto the nearest lines (x to a vertical line of
 * the row it sits in, y to a horizontal line), each only when within the
 * threshold, then clamp so the whole square stays inside the grid with
 * `margin` from its edges. Snapping happens before clamping, so a snap
 * never pushes the square out of bounds.
 */
export function snapFloat(
  center: { x: number; y: number },
  sizePx: number,
  lines: GridLines,
  bounds: { width: number; height: number },
  margin: number,
  threshold = SNAP_THRESHOLD,
): { x: number; y: number } {
  const row = rowAt(lines, center.y);
  const x = nearest(center.x, row?.xs ?? [], threshold);
  const y = nearest(center.y, lines.ys, threshold);
  return clampCenter({ x, y }, sizePx, bounds, margin);
}

export function clampCenter(
  center: { x: number; y: number },
  sizePx: number,
  bounds: { width: number; height: number },
  margin: number,
): { x: number; y: number } {
  const half = sizePx / 2;
  const minX = margin + half;
  const maxX = bounds.width - margin - half;
  const minY = margin + half;
  const maxY = bounds.height - margin - half;
  return {
    x: maxX < minX ? bounds.width / 2 : Math.min(maxX, Math.max(minX, center.x)),
    y: maxY < minY ? bounds.height / 2 : Math.min(maxY, Math.max(minY, center.y)),
  };
}

/** Two placements that would render the same tile. */
export function samePlacement(a: FloatPlacement | undefined, b: FloatPlacement | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.cx === b.cx && a.cy === b.cy && a.size === b.size;
}

export function clampFloatSize(size: number): number {
  return Math.min(MAX_FLOAT_SIZE, Math.max(MIN_FLOAT_SIZE, size));
}

/** Placement → pixels in a grid of the given size. */
export function floatToPx(
  float: FloatPlacement,
  bounds: { width: number; height: number },
): { x: number; y: number; size: number } {
  return {
    x: float.cx * bounds.width,
    y: float.cy * bounds.height,
    size: clampFloatSize(float.size) * bounds.width,
  };
}

/** Pixels → placement, rounded so the stored doc doesn't churn on noise. */
export function pxToFloat(
  px: { x: number; y: number; size: number },
  bounds: { width: number; height: number },
): FloatPlacement {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return {
    cx: r(px.x / bounds.width),
    cy: r(px.y / bounds.height),
    size: r(clampFloatSize(px.size / bounds.width)),
  };
}
