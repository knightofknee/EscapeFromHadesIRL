export type GridPosition = {
  row: number;
  col: number;
};

/** Relative size weight for tile layout. Default 1, max 100. Higher = bigger tile. */
export type TileSize = number;

export type RecordingMode = 'boolean' | 'triple' | 'quad' | 'counter' | 'value' | 'steps' | 'meditation' | 'creativeWriting';

/** A single meditation session, recorded by the timer or entered manually. */
export type MeditationSession = {
  /** Session duration in seconds. */
  durationSec: number;
  /** Whether this session came from a completed timer run or a manual log. */
  source: 'timer' | 'manual';
  /** Unix ms when the session was recorded. */
  loggedAt: number;
};

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
  /**
   * Ascending step thresholds for 'steps' mode, 1-3 entries. Index 0 is the
   * required Level 1 goal; the achieved tier maps onto the quad tiers
   * (Level 1/2/3 → yes/goal/ideal).
   */
  stepGoals?: number[];
  /**
   * For 'steps' mode: the last fully-ended local day (YYYY-MM-DD) whose
   * FINAL step count has been written to its record. A day's record is
   * otherwise only as fresh as the last foreground sync that day, so the
   * backfill writes every ended day after this date, then advances it.
   * Set to yesterday whenever a habit becomes a steps habit — days before
   * the switch are out of scope. Absent on habits from before this field
   * existed; the backfill then initializes it from a bounded scan.
   */
  stepsConfirmedThrough?: string;
  /**
   * For 'meditation' mode: target number of sessions per day (default 1).
   * "Goal" tier is reached when the user completes this many sessions of at
   * least `meditationMinutes` each in a single day.
   */
  meditationSessions?: number;
  /**
   * For 'meditation' mode: target minutes per session (default 5). A session
   * shorter than this duration still earns the "yes" tier but does NOT count
   * toward the goal tier.
   */
  meditationMinutes?: number;
  /**
   * For 'meditation' mode: total minutes meditated in a day to reach the
   * "ideal" tier (star). When set, the day is ideal once the summed duration
   * of all sessions reaches this many minutes. When unset (legacy habits), the
   * ideal tier falls back to "2+ sessions of 15+ minutes each".
   */
  meditationIdealTotalMinutes?: number;
  /**
   * When true, the habit's name renders at the bottom of the tile (below any
   * counter/value/step subtitle, above any goal/double bar). Defaults to
   * false — tiles are letter/glyph-only unless the user opts in.
   */
  showName?: boolean;
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
  /**
   * For 'steps' habits: whether this record came from automatic step sync
   * or a manual override. Manual always wins — auto sync never overwrites a
   * 'manual' record. Absent on legacy/other-mode records (treated as manual).
   */
  source?: 'auto' | 'manual';
  /** For 'steps' habits: the raw step count behind the achieved tier. */
  steps?: number;
  /**
   * For 'meditation' habits: every session logged on this date. Tier and
   * subtitle are derived from this array; never override `value` without
   * also updating `sessions` and recomputing.
   */
  sessions?: MeditationSession[];
};

export type VacationDay = {
  id: string; // `${userId}_${date}`
  userId: string;
  date: string; // YYYY-MM-DD
  label: string; // displayed on the V tile, default "V"
  color: string; // tile background, default green (#2ECC71)
  createdAt: number;
  updatedAt: number;
};

