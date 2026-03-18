import { useMemo } from 'react';
import type { Habit, TileSize } from '@/types/habit';
import { GRID } from '@/constants/grid';

type TileLayout = {
  habit: Habit;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * TileSize maps to a weight: bigger size = bigger tile relative to others.
 * '1x1' = 1, '2x1' = 2, '1x2' = 2, '2x2' = 4
 */
function sizeWeight(size: TileSize): number {
  switch (size) {
    case '1x1': return 1;
    case '2x1': return 2;
    case '1x2': return 2;
    case '2x2': return 4;
  }
}

/**
 * Layout algorithm: habits fill the available container.
 *
 * - With 1 habit, it takes the full space.
 * - With 2, they stack vertically 50/50 (adjusted by weight).
 * - With 3+, we pack them into rows. Heavier habits get more space.
 *
 * The approach: arrange habits into rows, then divide vertical space
 * proportionally by row weight, and horizontal space within each row
 * proportionally by tile weight.
 */
export function useGridLayout(
  habits: Habit[],
  containerWidth: number,
  containerHeight: number,
) {
  return useMemo(() => {
    if (containerWidth <= 0 || containerHeight <= 0 || habits.length === 0) {
      return { layouts: [], cellSize: 0, gridHeight: 0 };
    }

    const gap = GRID.cellGap;

    // Sort by position for deterministic ordering
    const sorted = [...habits].sort(
      (a, b) => a.position.row * 100 + a.position.col - (b.position.row * 100 + b.position.col),
    );

    // Decide how many columns to use based on habit count
    const n = sorted.length;
    let targetCols: number;
    if (n <= 2) targetCols = 1;
    else if (n <= 6) targetCols = 2;
    else if (n <= 12) targetCols = 3;
    else targetCols = 4;

    // Pack habits into rows greedily.
    // Each row gets up to `targetCols` habits (by count, not weight).
    // Heavier habits are placed in rows that have fewer items so they get more space.
    const rows: Habit[][] = [];
    let currentRow: Habit[] = [];

    for (const habit of sorted) {
      currentRow.push(habit);
      if (currentRow.length >= targetCols) {
        rows.push(currentRow);
        currentRow = [];
      }
    }
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    // Each row's height weight = max weight in that row (so a heavy tile makes its row taller)
    const rowWeights = rows.map((row) =>
      Math.max(...row.map((h) => sizeWeight(h.tileSize))),
    );
    const totalRowWeight = rowWeights.reduce((s, w) => s + w, 0);

    // Distribute vertical space proportionally
    const totalGapY = gap * (rows.length + 1);
    const availableHeight = containerHeight - totalGapY;

    const layouts: TileLayout[] = [];
    let y = gap;

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const rowHeight = (rowWeights[ri] / totalRowWeight) * availableHeight;

      // Within the row, distribute horizontal space proportionally by weight
      const colWeights = row.map((h) => sizeWeight(h.tileSize));
      const totalColWeight = colWeights.reduce((s, w) => s + w, 0);
      const totalGapX = gap * (row.length + 1);
      const availableWidth = containerWidth - totalGapX;

      let x = gap;
      for (let ci = 0; ci < row.length; ci++) {
        const tileWidth = (colWeights[ci] / totalColWeight) * availableWidth;

        layouts.push({
          habit: row[ci],
          x,
          y,
          width: tileWidth,
          height: rowHeight,
        });

        x += tileWidth + gap;
      }

      y += rowHeight + gap;
    }

    // cellSize approximation for TileContent font sizing
    const avgSize = Math.sqrt(
      (containerWidth * containerHeight) / Math.max(n, 1),
    );

    return { layouts, cellSize: avgSize, gridHeight: containerHeight };
  }, [habits, containerWidth, containerHeight]);
}
