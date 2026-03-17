import { useState, useCallback } from 'react';
import { StyleSheet, View, LayoutChangeEvent } from 'react-native';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGridLayout } from '@/hooks/use-grid-layout';
import { Tile } from './tile';
import type { Habit, HabitRecord } from '@/types/habit';

type TileGridProps = {
  habits: Habit[];
  records: Map<string, HabitRecord>;
  onTapHabit: (habitId: string) => void;
  onLongPressHabit: (habitId: string) => void;
  columns?: number;
};

export function TileGrid({ habits, records, onTapHabit, onLongPressHabit, columns }: TileGridProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { layouts, cellSize, gridHeight } = useGridLayout(habits, containerWidth, columns);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View
      style={[styles.container, { backgroundColor: colors.gridBackground }]}
      onLayout={handleLayout}
    >
      {containerWidth > 0 && (
        <View style={[styles.grid, { height: gridHeight }]}>
          {layouts.map((layout) => (
            <Tile
              key={layout.habit.id}
              habit={layout.habit}
              record={records.get(layout.habit.id)}
              x={layout.x}
              y={layout.y}
              width={layout.width}
              height={layout.height}
              cellSize={cellSize}
              onTap={onTapHabit}
              onLongPress={onLongPressHabit}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  grid: {
    position: 'relative',
  },
});
