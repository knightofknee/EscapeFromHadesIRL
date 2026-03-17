export type GridPosition = {
  row: number;
  col: number;
};

export type TileSize = '1x1' | '2x1' | '1x2' | '2x2';

export type RecordingMode = 'boolean' | 'triple' | 'counter' | 'value';

export type TripleValue = 'no' | 'yes' | 'double';

export type Habit = {
  id: string;
  userId: string;
  name: string;
  abbreviation: string;
  icon?: string;
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

export type DrawingData = {
  userId: string;
  date: string;
  paths: string;
  updatedAt: number;
};
