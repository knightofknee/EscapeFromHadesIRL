export const GRID = {
  defaultColumns: 4,
  cellGap: 4,
  cellPadding: 6,
  minCellSize: 64,
  dragActivationDelay: 400,
  spring: {
    damping: 15,
    stiffness: 150,
  },
} as const;

export const TILE_COLORS = [
  '#E74C3C', // red
  '#E67E22', // orange
  '#F1C40F', // yellow
  '#2ECC71', // green
  '#1ABC9C', // teal
  '#3498DB', // blue
  '#9B59B6', // purple
  '#E91E63', // pink
  '#00BCD4', // cyan
  '#8BC34A', // lime
  '#FF9800', // amber
  '#607D8B', // blue-grey
  '#795548', // brown
  '#9E9E9E', // grey
  '#34495E', // dark blue
  '#2C3E50', // midnight
] as const;

export const DEFAULT_TILE_COLOR = TILE_COLORS[5]; // blue

// Rolling-average line color per habit color — the color-wheel complement
// (or nearest high-contrast neighbor) drawn from the same palette, so the
// featured line never blends into its own habit's bars. Warm habits get
// cool lines and vice versa; neutrals/darks get gold, where it genuinely
// pops. Picked for visibility on both light and dark cards.
const ROLLING_AVG_LINE_COLORS: Record<string, string> = {
  '#E74C3C': '#00BCD4', // red → cyan
  '#E67E22': '#3498DB', // orange → blue
  '#F1C40F': '#9B59B6', // yellow → purple
  '#2ECC71': '#E91E63', // green → magenta
  '#1ABC9C': '#E74C3C', // teal → red
  '#3498DB': '#FF9800', // blue → amber
  '#9B59B6': '#F1C40F', // purple → yellow
  '#E91E63': '#2ECC71', // pink → green
  '#00BCD4': '#E74C3C', // cyan → red
  '#8BC34A': '#9B59B6', // lime → purple
  '#FF9800': '#3498DB', // amber → blue
  '#607D8B': '#FF9800', // blue-grey → amber
  '#795548': '#00BCD4', // brown → cyan
  '#9E9E9E': '#D4AC0D', // grey → gold
  '#34495E': '#D4AC0D', // dark blue → gold
  '#2C3E50': '#F1C40F', // midnight → yellow
};

/** Complementary line color for a habit's rolling-average line. Falls back
 * to long-term gold for colors outside the palette. */
export function rollingAvgLineColor(habitColor: string): string {
  return ROLLING_AVG_LINE_COLORS[habitColor.toUpperCase()] ?? '#D4AC0D';
}

