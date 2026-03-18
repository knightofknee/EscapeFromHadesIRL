import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { GRID } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TileContent } from './tile-content';
import type { Habit, HabitRecord } from '@/types/habit';

type TileDragOverlayProps = {
  habit: Habit;
  record?: HabitRecord;
  cellSize: number;
  width: number;
  height: number;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
};

export function TileDragOverlay({
  habit,
  record,
  cellSize,
  width,
  height,
  translateX,
  translateY,
}: TileDragOverlayProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: 1.05 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.overlay,
        animatedStyle,
        {
          width,
          height,
          backgroundColor: colors.tileBackground,
          borderColor: habit.color,
        },
      ]}
    >
      <TileContent habit={habit} record={record} tileWidth={width} tileHeight={height} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 2,
    padding: GRID.cellPadding,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
});
