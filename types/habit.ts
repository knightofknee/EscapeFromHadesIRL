export type GridPosition = {
  row: number;
  col: number;
};

export type TileSize = '1x1' | '2x1' | '1x2' | '2x2';

export type RecordingMode = 'boolean' | 'triple' | 'counter' | 'value';

export type TripleValue = 'no' | 'yes' | 'double';

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
  value: boolean | TripleValue | number | string;
  recordedAt: number;
};

export type GridConfig = {
  userId: string;
  columns: number;
  statsButtonPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
};

