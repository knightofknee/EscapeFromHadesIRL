/**
 * Pick black or white text to put on top of a colored background, based
 * on WCAG relative luminance. Threshold 0.55 was tuned against the app's
 * `TILE_COLORS` palette so saturated yellows / limes get black text and
 * deep blues / reds get white text.
 *
 * Accepts hex strings in #RGB or #RRGGBB form. Falls back to white text
 * for malformed inputs (safer default — most app accents are dark).
 */
export function readableTextOn(bgHex: string): '#000000' | '#FFFFFF' {
  const lum = relativeLuminance(bgHex);
  return lum > 0.55 ? '#000000' : '#FFFFFF';
}

/** Computes WCAG relative luminance (0–1) for a hex color. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((c) => c / 255);
  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Parse #RGB or #RRGGBB into [r,g,b] (0–255). Returns null on failure. */
function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}
