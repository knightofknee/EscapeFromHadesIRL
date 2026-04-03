export type GridPosition = {
  row: number;
  col: number;
};

/** Relative size weight for tile layout. Default 1, max 100. Higher = bigger tile. */
export type TileSize = number;

export type RecordingMode = 'boolean' | 'triple' | 'quad' | 'counter' | 'value';

export type TripleValue = 'no' | 'yes' | 'double';

export type QuadValue = 'no' | 'yes' | 'goal' | 'ideal';

export type SerializedPath = {
  points: string; // SVG path string (e.g. "M 10 20 L 30 40 ...")
  color: string;
  strokeWidth: number;
};

export type GlyphData = {
  paths: SerializedPath[];
  viewBox: { width: number; height: number }; // canvas size when drawn, for scaling
};

export type Habit = {
  id: string;
  userId: string;
  name: string;
  abbreviation: string;
  icon?: string;
  glyph?: GlyphData; // custom hand-drawn symbol
  recordingMode: RecordingMode;
  tileSize: TileSize;
  position: GridPosition;
  color: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
};

export type HabitRecord = {
  id: string;
  habitId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  value: boolean | TripleValue | QuadValue | number | string;
  recordedAt: number;
};

export type GridConfig = {
  userId: string;
  columns: number;
  statsButtonPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};

