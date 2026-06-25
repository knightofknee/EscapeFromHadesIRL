// Creation logic behind the starter-task intro picker (app/starter-setup.tsx).
// Given a set of selected preset keys, this creates each habit with a distinct
// acronym, a non-repeating color, and a free grid position — plus its linked
// quest where a curated template exists. Pure helpers (acronym/color/position/
// already-added) are exported for the picker's gray-out + for unit tests.
import { GRID, TILE_COLORS } from '@/constants/grid';
import { STARTER_TASKS, type StarterTask } from '@/constants/starter-tasks';
import { TEMPLATE_BY_KEY } from '@/constants/quest-templates';
import { addDays } from '@/lib/date-utils';
import type { GridPosition, Habit } from '@/types/habit';
import type { Quest } from '@/types/quest';

export type StarterContext = {
  createHabit: (
    habit: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ) => Promise<Habit | undefined>;
  createQuest: (
    quest: Omit<Quest, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'activatedAt'>,
  ) => Promise<Quest | undefined>;
};

/**
 * Best-effort: the existing habit that represents this starter, if any.
 * walk/meditate/write have unique auto recording modes, so a mode match is
 * exact. The manual (quad) presets share a mode, so they match on name.
 */
export function findExistingStarter(task: StarterTask, habits: Habit[]): Habit | undefined {
  if (task.recordingMode !== 'quad') {
    return habits.find((h) => h.recordingMode === task.recordingMode);
  }
  const name = task.label.trim().toLowerCase();
  return habits.find((h) => h.name.trim().toLowerCase() === name);
}

export function isStarterAdded(task: StarterTask, habits: Habit[]): boolean {
  return findExistingStarter(task, habits) !== undefined;
}

/** First acronym form not already in `used` (uppercased). Falls back to the
 *  label's leading letters, then a numbered suffix, so it always returns. */
export function pickAcronym(task: StarterTask, used: Set<string>): string {
  for (const a of task.acronyms) {
    if (!used.has(a.toUpperCase())) return a;
  }
  const letters = task.label.toUpperCase().replace(/[^A-Z]/g, '');
  for (let n = 1; n <= letters.length; n++) {
    const cand = letters.slice(0, n);
    if (cand && !used.has(cand)) return cand;
  }
  let i = 2;
  const base = (task.acronyms[0] ?? letters.slice(0, 1) ?? 'X').toUpperCase();
  while (used.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

/** The task's preferred color if free, else the next unused palette color. */
export function pickColor(task: StarterTask, used: Set<string>): string {
  if (!used.has(task.color.toUpperCase())) return task.color;
  for (const c of TILE_COLORS) {
    if (!used.has(c.toUpperCase())) return c;
  }
  return task.color; // palette exhausted — accept a repeat over crashing
}

/** `count` free cells, filled row-major across the grid's columns, skipping
 *  any cell an existing habit already occupies. */
export function computeFreePositions(habits: Habit[], count: number): GridPosition[] {
  const columns = GRID.defaultColumns;
  const occupied = new Set(habits.map((h) => `${h.position.row},${h.position.col}`));
  const out: GridPosition[] = [];
  for (let row = 0; out.length < count && row < 1000; row++) {
    for (let col = 0; col < columns && out.length < count; col++) {
      if (!occupied.has(`${row},${col}`)) out.push({ row, col });
    }
  }
  return out;
}

/** The selected, not-already-added starter tasks in canonical order. */
export function resolveStarterTasks(selectedKeys: string[], habits: Habit[]): StarterTask[] {
  const keys = new Set(selectedKeys);
  return STARTER_TASKS.filter((t) => keys.has(t.key) && !isStarterAdded(t, habits));
}

/**
 * Create the selected starter tasks: each habit (distinct acronym + color +
 * free position, name label shown) and its linked quest where a template
 * exists. Sequential so each quest links the habit id just created. Skips any
 * already represented in `habits`. Returns the habits actually created.
 */
export async function applyStarterTasks(
  selectedKeys: string[],
  habits: Habit[],
  todayStr: string,
  ctx: StarterContext,
): Promise<Habit[]> {
  const tasks = resolveStarterTasks(selectedKeys, habits);
  if (tasks.length === 0) return [];

  const usedAbbr = new Set(
    habits.map((h) => (h.abbreviation ?? '').toUpperCase()).filter(Boolean),
  );
  const usedColor = new Set(
    habits.map((h) => (h.color ?? '').toUpperCase()).filter(Boolean),
  );
  const positions = computeFreePositions(habits, tasks.length);

  const created: Habit[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const abbreviation = pickAcronym(task, usedAbbr);
    usedAbbr.add(abbreviation.toUpperCase());
    const color = pickColor(task, usedColor);
    usedColor.add(color.toUpperCase());

    const habitInput: Omit<Habit, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
      name: task.label,
      abbreviation,
      recordingMode: task.recordingMode,
      tileSize: 1,
      position: positions[i] ?? { row: 0, col: 0 },
      color,
      showName: true,
      isArchived: false,
      ...(task.stepGoals ? { stepGoals: task.stepGoals } : {}),
      ...(task.recordingMode === 'steps'
        ? { stepsConfirmedThrough: addDays(todayStr, -1) }
        : {}),
      ...(task.meditationSessions != null ? { meditationSessions: task.meditationSessions } : {}),
      ...(task.meditationMinutes != null ? { meditationMinutes: task.meditationMinutes } : {}),
      ...(task.meditationIdealTotalMinutes != null
        ? { meditationIdealTotalMinutes: task.meditationIdealTotalMinutes }
        : {}),
    };

    const habit = await ctx.createHabit(habitInput);
    if (!habit) continue; // blocked (offline guard already alerted) — keep going
    created.push(habit);

    if (task.questTemplateKey) {
      const t = TEMPLATE_BY_KEY[task.questTemplateKey];
      if (t) {
        await ctx.createQuest({
          templateKey: t.key,
          name: t.name,
          description: t.description,
          category: t.category,
          questType: t.questType,
          targetDaysPerWeek: t.targetDaysPerWeek,
          linkedHabitIds: [habit.id],
          successLevel: t.successLevel ?? 1,
          scoreWindow: t.scoreWindow ?? 'both',
          status: 'active',
        });
      }
    }
  }
  return created;
}
