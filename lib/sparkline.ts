/**
 * Curve math for the Month view sparklines.
 *
 * Two steps: a light "best fit" smoothing of the daily values, then a
 * smooth curve drawn through the smoothed points.
 *
 * 1. Smoothing is Gaussian kernel regression (Nadaraya-Watson): each day's
 *    fitted value is a weighted average of every day, weight e^(-d²/2σ²) by
 *    distance d in days. σ = 1 day keeps it close to the data (a real dip
 *    still reads as a dip) while an every-other-day pattern reads as a wave
 *    around 50% instead of a sawtooth.
 * 2. The curve is a monotone cubic (Fritsch-Carlson, the same rule as d3's
 *    curveMonotoneX): a cubic Bézier between neighbors whose tangents are
 *    clamped so the line never overshoots a point. Sharp turns are fine; a
 *    bump past the data (or below zero) is not.
 */

export type XY = { x: number; y: number };

export function smoothSeries(points: XY[], sigma = 1): XY[] {
  if (sigma <= 0 || points.length < 3) return points.map((p) => ({ ...p }));
  const twoSigmaSq = 2 * sigma * sigma;
  return points.map(({ x }) => {
    let wSum = 0;
    let ySum = 0;
    for (const p of points) {
      const d = p.x - x;
      const w = Math.exp(-(d * d) / twoSigmaSq);
      wSum += w;
      ySum += w * p.y;
    }
    return { x, y: wSum > 0 ? ySum / wSum : 0 };
  });
}

const sign = (n: number) => (n < 0 ? -1 : 1);

/** Tangent at an interior point (Steffen/Fritsch-Carlson clamp, as in d3). */
function interiorSlope(p0: XY, p1: XY, p2: XY): number {
  const h0 = p1.x - p0.x;
  const h1 = p2.x - p1.x;
  const s0 = (p1.y - p0.y) / h0;
  const s1 = (p2.y - p1.y) / h1;
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** Tangent at an endpoint, from the segment slope and its neighbor's tangent. */
function endSlope(a: XY, b: XY, neighborSlope: number): number {
  const h = b.x - a.x;
  return h ? (3 * (b.y - a.y) / h - neighborSlope) / 2 : neighborSlope;
}

/** Monotone tangents for every point (x strictly increasing). */
export function monotoneSlopes(pts: XY[]): number[] {
  const n = pts.length;
  if (n < 2) return pts.map(() => 0);
  if (n === 2) {
    const s = (pts[1].y - pts[0].y) / (pts[1].x - pts[0].x);
    return [s, s];
  }
  const m = new Array<number>(n);
  for (let i = 1; i < n - 1; i++) m[i] = interiorSlope(pts[i - 1], pts[i], pts[i + 1]);
  m[0] = endSlope(pts[0], pts[1], m[1]);
  m[n - 1] = endSlope(pts[n - 1], pts[n - 2], m[n - 2]);
  return m;
}

/** SVG path data for a monotone cubic through `pts` (already in screen space). */
export function monotoneCurvePath(pts: XY[]): string {
  if (pts.length === 0) return '';
  const f = (n: number) => Math.round(n * 100) / 100;
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  if (pts.length === 1) return d;
  const m = monotoneSlopes(pts);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = (b.x - a.x) / 3;
    d += ` C${f(a.x + dx)},${f(a.y + dx * m[i])} ${f(b.x - dx)},${f(b.y - dx * m[i + 1])} ${f(b.x)},${f(b.y)}`;
  }
  return d;
}
