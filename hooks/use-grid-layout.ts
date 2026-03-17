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

function tileSizeToCells(size: TileSize): { cols: number; rows: number } {
  switch (size) {
    case '1x1':
      return { cols: 1, rows: 1 };
    case '2x1':
      return { cols: 2, rows: 1 };
    case '1x2':
      return { cols: 1, rows: 2 };
    case '2x2':
      return { cols: 2, rows: 2 };
  }
}

export function useGridLayout(habits: Habit[], containerWidth: number, columns?: number) {
  const cols = columns ?? GRID.defaultColumns;

  return useMemo(() => {
    if (containerWidth <= 0) return { layouts: [], cellSize: 0, gridHeight: 0 };

    const cellSize = (containerWidth - GRID.cellGap * (cols + 1)) / cols;

    // Build occupancy grid and place tiles
    const occupied: boolean[][] = [];
    const layouts: TileLayout[] = [];

    function ensureRows(rowCount: number) {
      while (occupied.length < rowCount) {
        occupied.push(new Array(cols).fill(false));
      }
    }

    function canPlace(row: number, col: number, tileCols: number, tileRows: number): boolean {
      if (col + tileCols > cols) return false;
      ensureRows(row + tileRows);
      for (let r = row; r < row + tileRows; r++) {
        for (let c = col; c < col + tileCols; c++) {
          if (occupied[r][c]) return false;
        }
      }
      return true;
    }

    function place(row: number, col: number, tileCols: number, tileRows: number) {
      ensureRows(row + tileRows);
      for (let r = row; r < row + tileRows; r++) {
        for (let c = col; c < col + tileCols; c++) {
          occupied[r][c] = true;
        }
      }
    }

    // Sort habits by position (row first, then col)
    const sorted = [...habits].sort(
      (a, b) => a.position.row * 100 + a.position.col - (b.position.row * 100 + b.position.col),
    );

    for (const habit of sorted) {
      const { cols: tileCols, rows: tileRows } = tileSizeToCells(habit.tileSize);

      // Try to place at preferred position first
      if (canPlace(habit.position.row, habit.position.col, tileCols, tileRows)) {
        place(habit.position.row, habit.position.col, tileCols, tileRows);
        layouts.push({
          habit,
          x: GRID.cellGap + habit.position.col * (cellSize + GRID.cellGap),
          y: GRID.cellGap + habit.position.row * (cellSize + GRID.cellGap),
          width: tileCols * cellSize + (tileCols - 1) * GRID.cellGap,
          height: tileRows * cellSize + (tileRows - 1) * GRID.cellGap,
        });
        continue;
      }

      // Find next available position
      let placed = false;
      ensureRows(occupied.length + tileRows + 1);
      const maxRows = 100; // Safety limit
      for (let r = 0; !placed && r < maxRows; r++) {
        ensureRows(r + tileRows);
        for (let c = 0; c <= cols - tileCols; c++) {
          if (canPlace(r, c, tileCols, tileRows)) {
            place(r, c, tileCols, tileRows);
            layouts.push({
              habit,
              x: GRID.cellGap + c * (cellSize + GRID.cellGap),
              y: GRID.cellGap + r * (cellSize + GRID.cellGap),
              width: tileCols * cellSize + (tileCols - 1) * GRID.cellGap,
              height: tileRows * cellSize + (tileRows - 1) * GRID.cellGap,
            });
            placed = true;
            break;
          }
        }
      }
    }

    const maxRow = occupied.length;
    const gridHeight = maxRow * (cellSize + GRID.cellGap) + GRID.cellGap;

    return { layouts, cellSize, gridHeight };
  }, [habits, containerWidth, cols]);
}
