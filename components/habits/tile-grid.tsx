import { useState, useCallback, useMemo, useRef, memo, type RefObject } from 'react';
import { StyleSheet, View, Pressable, Platform, LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/theme';
import { GRID } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TileContent } from './tile-content';
import { FloatTile } from './float-tile';
import { gridLines, type Rect } from '@/lib/float-tile';
import { HoloFoil, type FoilPalette } from '@/components/habit-quest/holo-foil';
import { TileBadges } from '@/components/habit-quest/tile-badges';
import type { HabitBadge } from '@/hooks/use-habit-badges';
import { isRecordCompleted } from '@/lib/habit-scoring';
import type { FloatPlacement, Habit, HabitRecord } from '@/types/habit';

type TileGridProps = {
  habits: Habit[];
  records: Map<string, HabitRecord>;
  onTapHabit: (habitId: string) => void;
  onLongPressHabit: (habitId: string) => void;
  /** The 60-day quest habit: its tile wears the holo foil. */
  holoHabitId?: string | null;
  /** Bump to flash the holo tile (the per-day quest celebration). */
  holoFlashKey?: number;
  /** Attached to the holo tile, so the celebration can burst from where it sits. */
  holoTileRef?: RefObject<View | null>;
  /** The Level Two habit: its tile wears the deep blue foil (over the rainbow when it's both). */
  deepHoloHabitId?: string | null;
  deepHoloFlashKey?: number;
  deepHoloTileRef?: RefObject<View | null>;
  /** 60-day medals and remission marks, by habit id. */
  badges?: Map<string, HabitBadge>;
  /**
   * Placement mode (the habit editor): this habit floats with the given
   * placement and can be dragged and pinched; every drop is reported, not
   * saved. The habit may be a draft that is not in `habits` yet. Every other
   * tile is drawn as on the home screen but locked.
   */
  editingFloat?: {
    habit: Habit;
    float: FloatPlacement;
    onChange: (float: FloatPlacement) => void;
  };
};

function sizeWeight(size: number): number {
  return Math.max(1, Math.min(size, 100));
}

const MeasuredTile = memo(function MeasuredTile({
  habit,
  record,
  flexWeight,
  colors,
  onTap,
  onLongPress,
  foil,
  holoFlashKey,
  holoTileRef,
  badge,
  onMeasure,
}: {
  habit: Habit;
  record?: HabitRecord;
  flexWeight: number;
  colors: (typeof Colors)['light'];
  onTap: (id: string) => void;
  onLongPress: (id: string) => void;
  /** The quest foil this tile wears, if any. */
  foil: FoilPalette | null;
  holoFlashKey: number;
  holoTileRef?: RefObject<View | null>;
  badge?: HabitBadge;
  /** Reports the tile's rect within its row, for the float snap lines. */
  onMeasure?: (habitId: string, rect: Rect) => void;
}) {
  const [tileW, setTileW] = useState(0);
  const [tileH, setTileH] = useState(0);

  const habitId = habit.id;
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      setTileW(e.nativeEvent.layout.width);
      setTileH(e.nativeEvent.layout.height);
      onMeasure?.(habitId, e.nativeEvent.layout);
    },
    [onMeasure, habitId],
  );

  // Through the shared completion table — an inline truthy check here is how
  // the value-mode "0" bug shipped (string "0" passed !== 0 and !== '').
  const isRecorded = isRecordCompleted(habit, record);

  return (
    <Pressable
      ref={foil ? holoTileRef : undefined}
      style={[
        styles.tile,
        {
          flex: flexWeight,
          backgroundColor: colors.tileBackground,
          borderColor: isRecorded ? habit.color : colors.tileBorder,
          borderWidth: isRecorded ? 2 : 1,
        },
      ]}
      onLayout={handleLayout}
      onPress={() => {
        if (Platform.OS === 'ios' && !Platform.isPad) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onTap(habit.id);
      }}
      onLongPress={() => {
        if (Platform.OS === 'ios' && !Platform.isPad) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress(habit.id);
      }}
      delayLongPress={GRID.dragActivationDelay}
    >
      {tileW > 0 && tileH > 0 && (
        <TileContent habit={habit} record={record} tileWidth={tileW} tileHeight={tileH} />
      )}
      {foil && <HoloFoil variant="tile" palette={foil} flashKey={holoFlashKey} />}
      {badge && tileW > 0 && (
        <TileBadges badge={badge} size={Math.min(tileW, tileH)} bg={colors.tileBackground} />
      )}
    </Pressable>
  );
});

export function TileGrid({
  habits,
  records,
  onTapHabit,
  onLongPressHabit,
  holoHabitId,
  holoFlashKey = 0,
  holoTileRef,
  deepHoloHabitId,
  deepHoloFlashKey = 0,
  deepHoloTileRef,
  badges,
  editingFloat,
}: TileGridProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Floating habits sit above the grid and take no cell: the row/column
  // layout is computed from the others alone, so adding a float never
  // reshapes the grid. The habit being placed is drawn separately, so it
  // leaves both the grid and the locked floats.
  const editingId = editingFloat?.habit.id;
  const { rows, rowWeights, floats } = useMemo(() => {
    const others = habits.filter((h) => h.id !== editingId);
    const floating = others.filter((h) => h.float != null);
    const sorted = others.filter((h) => h.float == null).sort(
      (a, b) => a.position.row * 100 + a.position.col - (b.position.row * 100 + b.position.col),
    );
    const targetCols =
      sorted.length <= 2 ? 1 : sorted.length <= 6 ? 2 : sorted.length <= 12 ? 3 : 4;

    const builtRows: Habit[][] = [];
    let currentRow: Habit[] = [];
    for (const habit of sorted) {
      currentRow.push(habit);
      if (currentRow.length >= targetCols) {
        builtRows.push(currentRow);
        currentRow = [];
      }
    }
    if (currentRow.length > 0) builtRows.push(currentRow);

    const weights = builtRows.map((row) =>
      Math.max(...row.map((h) => sizeWeight(h.tileSize))),
    );
    return { rows: builtRows, rowWeights: weights, floats: floating };
  }, [habits, editingId]);

  // Measured geometry for the float snap lines: row rects in the container,
  // tile rects within their row. Refs, not state: layout events fire for
  // every tile on every grid change and nothing needs to re-render for them;
  // the lines are read once, when a float is dropped.
  const rowRectsRef = useRef<Map<number, Rect>>(new Map());
  const tileRectsRef = useRef<Map<string, Rect>>(new Map());
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const onGridLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setGridSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  }, []);
  const onTileMeasure = useCallback((habitId: string, rect: Rect) => {
    tileRectsRef.current.set(habitId, rect);
  }, []);
  const getLines = useCallback(() => {
    const rowRects: Rect[] = [];
    const tileRects: Rect[][] = [];
    rows.forEach((row, ri) => {
      const r = rowRectsRef.current.get(ri);
      if (!r) return;
      rowRects.push(r);
      tileRects.push(row.map((h) => tileRectsRef.current.get(h.id)).filter((t): t is Rect => t != null));
    });
    return gridLines(rowRects, tileRects);
  }, [rows]);
  return (
    <View style={[styles.container, { backgroundColor: colors.gridBackground }]} onLayout={onGridLayout}>
      {rows.map((row, ri) => {
        const colWeights = row.map((h) => sizeWeight(h.tileSize));

        return (
          <View
            key={ri}
            style={[styles.row, { flex: rowWeights[ri] }]}
            onLayout={(e) => rowRectsRef.current.set(ri, e.nativeEvent.layout)}
          >
            {row.map((habit, ci) => (
              <MeasuredTile
                key={habit.id}
                habit={habit}
                record={records.get(habit.id)}
                flexWeight={colWeights[ci]}
                colors={colors}
                onTap={onTapHabit}
                onLongPress={onLongPressHabit}
                foil={habit.id === deepHoloHabitId ? 'deep' : habit.id === holoHabitId ? 'rainbow' : null}
                holoFlashKey={
                  habit.id === deepHoloHabitId
                    ? deepHoloFlashKey + (habit.id === holoHabitId ? holoFlashKey : 0)
                    : habit.id === holoHabitId
                      ? holoFlashKey
                      : 0
                }
                holoTileRef={habit.id === deepHoloHabitId ? deepHoloTileRef : holoTileRef}
                badge={badges?.get(habit.id)}
                onMeasure={onTileMeasure}
              />
            ))}
          </View>
        );
      })}
      {gridSize.width > 0 &&
        floats.map((habit) => (
          <FloatTile
            key={habit.id}
            habit={habit}
            float={habit.float!}
            record={records.get(habit.id)}
            width={gridSize.width}
            height={gridSize.height}
            colors={colors}
            getLines={getLines}
            onTap={onTapHabit}
            onLongPress={onLongPressHabit}
          />
        ))}
      {gridSize.width > 0 && editingFloat && (
        <FloatTile
          key={editingFloat.habit.id}
          habit={editingFloat.habit}
          float={editingFloat.float}
          record={records.get(editingFloat.habit.id)}
          width={gridSize.width}
          height={gridSize.height}
          colors={colors}
          getLines={getLines}
          editable
          onChange={editingFloat.onChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: GRID.cellGap,
    gap: GRID.cellGap,
  },
  row: {
    flexDirection: 'row',
    gap: GRID.cellGap,
  },
  tile: {
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
});
