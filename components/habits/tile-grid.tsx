import { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, Platform, LayoutChangeEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/theme';
import { GRID } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TileContent } from './tile-content';
import type { Habit, HabitRecord } from '@/types/habit';

type TileGridProps = {
  habits: Habit[];
  records: Map<string, HabitRecord>;
  onTapHabit: (habitId: string) => void;
  onLongPressHabit: (habitId: string) => void;
};

function sizeWeight(size: number): number {
  return Math.max(1, Math.min(size, 100));
}

function MeasuredTile({
  habit,
  record,
  flexWeight,
  colors,
  onTap,
  onLongPress,
}: {
  habit: Habit;
  record?: HabitRecord;
  flexWeight: number;
  colors: (typeof Colors)['light'];
  onTap: (id: string) => void;
  onLongPress: (id: string) => void;
}) {
  const [tileW, setTileW] = useState(0);
  const [tileH, setTileH] = useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setTileW(e.nativeEvent.layout.width);
    setTileH(e.nativeEvent.layout.height);
  }, []);

  const isRecorded =
    record != null &&
    record.value !== false &&
    record.value !== 'no' &&
    record.value !== 0 &&
    record.value !== '';

  return (
    <Pressable
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
    </Pressable>
  );
}

export function TileGrid({ habits, records, onTapHabit, onLongPressHabit }: TileGridProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const sorted = [...habits].sort(
    (a, b) => a.position.row * 100 + a.position.col - (b.position.row * 100 + b.position.col),
  );

  const n = sorted.length;
  const targetCols = n <= 2 ? 1 : n <= 6 ? 2 : n <= 12 ? 3 : 4;

  const rows: Habit[][] = [];
  let currentRow: Habit[] = [];
  for (const habit of sorted) {
    currentRow.push(habit);
    if (currentRow.length >= targetCols) {
      rows.push(currentRow);
      currentRow = [];
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const rowWeights = rows.map((row) =>
    Math.max(...row.map((h) => sizeWeight(h.tileSize))),
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.gridBackground }]}>
      {rows.map((row, ri) => {
        const colWeights = row.map((h) => sizeWeight(h.tileSize));

        return (
          <View key={ri} style={[styles.row, { flex: rowWeights[ri] }]}>
            {row.map((habit, ci) => (
              <MeasuredTile
                key={habit.id}
                habit={habit}
                record={records.get(habit.id)}
                flexWeight={colWeights[ci]}
                colors={colors}
                onTap={onTapHabit}
                onLongPress={onLongPressHabit}
              />
            ))}
          </View>
        );
      })}
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
