import { StyleSheet, Pressable, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { GRID } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TileContent } from './tile-content';
import type { Habit, HabitRecord } from '@/types/habit';

type TileProps = {
  habit: Habit;
  record?: HabitRecord;
  x: number;
  y: number;
  width: number;
  height: number;
  cellSize: number;
  onTap: (habitId: string) => void;
  onLongPress: (habitId: string) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Tile({ habit, record, x, y, width, height, cellSize, onTap, onLongPress }: TileProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const isRecorded =
    record != null &&
    record.value !== false &&
    record.value !== 'no' &&
    record.value !== 0 &&
    record.value !== '';

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(1, GRID.spring) }],
  }));

  function handleTap() {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onTap(habit.id);
  }

  function handleLongPress() {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onLongPress(habit.id);
  }

  return (
    <AnimatedPressable
      style={[
        styles.tile,
        animatedStyle,
        {
          position: 'absolute',
          left: x,
          top: y,
          width,
          height,
          backgroundColor: colors.tileBackground,
          borderColor: isRecorded ? habit.color : colors.tileBorder,
          borderWidth: isRecorded ? 2 : 1,
        },
      ]}
      onPress={handleTap}
      onLongPress={handleLongPress}
      delayLongPress={GRID.dragActivationDelay}
    >
      <TileContent habit={habit} record={record} cellSize={cellSize} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 8,
    padding: GRID.cellPadding,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
});
