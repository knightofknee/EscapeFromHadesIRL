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
