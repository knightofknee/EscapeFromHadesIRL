import { memo, useCallback, useEffect, useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { TileContent } from '@/components/habits/tile-content';
import { GRID } from '@/constants/grid';
import { Colors } from '@/constants/theme';
import {
  floatToPx,
  pxToFloat,
  snapFloat,
  MAX_FLOAT_SIZE,
  MIN_FLOAT_SIZE,
  type GridLines,
} from '@/lib/float-tile';
import { isRecordCompleted } from '@/lib/habit-scoring';
import { formatHoursMinutes } from '@/lib/phone-free';
import type { FloatPlacement, Habit, HabitRecord } from '@/types/habit';

type FloatTileProps = {
  habit: Habit;
  float: FloatPlacement;
  record?: HabitRecord;
  /** Grid container size (pt). */
  width: number;
  height: number;
  colors: (typeof Colors)['light'];
  /** Current snap lines, read when a drag or pinch ends. */
  getLines: () => GridLines;
  /**
   * Locked (the home screen, default): tap and long press, like any tile;
   * it cannot be moved. Editable (the placement editor): drag and pinch
   * only, and every drop is reported through `onChange`.
   */
  editable?: boolean;
  onTap?: (id: string) => void;
  onLongPress?: (id: string) => void;
  /** Editable only: the dropped, snapped placement (not yet saved). */
  onChange?: (float: FloatPlacement) => void;
};

const SETTLE = { duration: 180, easing: Easing.out(Easing.cubic) };

/**
 * A habit that floats above the grid: a square the user places anywhere.
 * Placement is edited on purpose, from the habit editor's placement mode,
 * never by a stray drag on the home screen: there the tile is locked and
 * behaves like any other tile. In placement mode, drag moves it and pinch
 * resizes it; on release it snaps to the nearest line between tiles (so it
 * can sit astride two neighbours) and is reported as fractions of the grid.
 *
 * Face: phone-free habits show the night's hours and nothing else (the
 * user's call: no letter, no emoji). Other modes get the regular tile face.
 */
export const FloatTile = memo(function FloatTile({
  habit,
  float,
  record,
  width,
  height,
  colors,
  getLines,
  editable = false,
  onTap,
  onLongPress,
  onChange,
}: FloatTileProps) {
  const bounds = useMemo(() => ({ width, height }), [width, height]);
  const px = useMemo(() => floatToPx(float, bounds), [float, bounds]);

  const cx = useSharedValue(px.x);
  const cy = useSharedValue(px.y);
  const size = useSharedValue(px.size);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startSize = useSharedValue(0);
  const interacting = useSharedValue(false);

  // Follow the stored placement (another device, the editor, a resize of
  // the grid) unless a finger is on the tile.
  useEffect(() => {
    if (interacting.value) return;
    cx.value = px.x;
    cy.value = px.y;
    size.value = px.size;
  }, [px, cx, cy, size, interacting]);

  const habitId = habit.id;
  const finish = useCallback(
    (x: number, y: number, s: number) => {
      const snapped = snapFloat({ x, y }, s, getLines(), bounds, GRID.cellGap);
      const moved = Math.abs(snapped.x - x) > 0.5 || Math.abs(snapped.y - y) > 0.5;
      if (moved && Platform.OS === 'ios' && !Platform.isPad) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      cx.value = withTiming(snapped.x, SETTLE);
      cy.value = withTiming(snapped.y, SETTLE);
      interacting.value = false;
      onChange?.(pxToFloat({ x: snapped.x, y: snapped.y, size: s }, bounds));
    },
    [getLines, bounds, cx, cy, interacting, onChange],
  );

  const tapHabit = useCallback(() => {
    if (Platform.OS === 'ios' && !Platform.isPad) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTap?.(habitId);
  }, [onTap, habitId]);
  const longPressHabit = useCallback(() => {
    if (Platform.OS === 'ios' && !Platform.isPad) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.(habitId);
  }, [onLongPress, habitId]);

  const gesture = useMemo(() => {
    if (!editable) {
      const tap = Gesture.Tap().onEnd((_e, success) => {
        'worklet';
        if (success) runOnJS(tapHabit)();
      });
      const longPress = Gesture.LongPress()
        .minDuration(GRID.dragActivationDelay)
        .onStart(() => {
          'worklet';
          runOnJS(longPressHabit)();
        });
      return Gesture.Exclusive(longPress, tap);
    }
    const minPx = MIN_FLOAT_SIZE * width;
    const maxPx = MAX_FLOAT_SIZE * width;
    const pan = Gesture.Pan()
      .minDistance(6)
      .onStart(() => {
        'worklet';
        interacting.value = true;
        startX.value = cx.value;
        startY.value = cy.value;
      })
      .onUpdate((e) => {
        'worklet';
        cx.value = startX.value + e.translationX;
        cy.value = startY.value + e.translationY;
      })
      .onEnd(() => {
        'worklet';
        runOnJS(finish)(cx.value, cy.value, size.value);
      });
    const pinch = Gesture.Pinch()
      .onStart(() => {
        'worklet';
        interacting.value = true;
        startSize.value = size.value;
      })
      .onUpdate((e) => {
        'worklet';
        const next = Math.min(maxPx, Math.max(minPx, startSize.value * e.scale));
        size.value = next;
        // Keep the growing square inside the grid. Inline (not clampCenter):
        // this runs on the UI thread, where only worklets can be called.
        const half = next / 2;
        const margin = GRID.cellGap;
        const minX = margin + half;
        const maxX = width - margin - half;
        const minY = margin + half;
        const maxY = height - margin - half;
        cx.value = maxX < minX ? width / 2 : Math.min(maxX, Math.max(minX, cx.value));
        cy.value = maxY < minY ? height / 2 : Math.min(maxY, Math.max(minY, cy.value));
      })
      .onEnd(() => {
        'worklet';
        runOnJS(finish)(cx.value, cy.value, size.value);
      });
    return Gesture.Simultaneous(pan, pinch);
  }, [editable, width, height, cx, cy, size, startX, startY, startSize, interacting, finish, tapHabit, longPressHabit]);

  const animatedStyle = useAnimatedStyle(() => ({
    left: cx.value - size.value / 2,
    top: cy.value - size.value / 2,
    width: size.value,
    height: size.value,
  }));

  const recorded = isRecordCompleted(habit, record);
  const numberOnly = habit.recordingMode === 'phoneFree';
  const hours = record?.phoneFreeMs != null && record.phoneFreeMs > 0 ? formatHoursMinutes(record.phoneFreeMs) : null;
  // ThemedText's default lineHeight (24) clips a bigger glyph on iOS, so the
  // line height scales with the font. The text also gets an explicit width
  // and is remounted when the tile's size changes: adjustsFontSizeToFit
  // shrinks to the frame the text is first laid out in and does not grow
  // back, and inside a modal the grid's first layout pass is a small one,
  // which left a tiny number until the tile was pinched.
  const numberSize = Math.max(12, px.size * 0.26);
  const numberWidth = Math.max(0, Math.round(px.size) - 8);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.tile,
          animatedStyle,
          {
            backgroundColor: colors.tileBackground,
            // In placement mode the tile wears the accent so it reads as the
            // thing being moved; locked, it borders like any tile.
            borderColor: editable ? colors.tint : recorded ? habit.color : colors.tileBorder,
            borderWidth: editable || recorded ? 2 : 1,
          },
        ]}
      >
        {numberOnly ? (
          <ThemedText
            key={numberWidth}
            style={[
              styles.number,
              {
                fontSize: numberSize,
                lineHeight: Math.round(numberSize * 1.2),
                width: numberWidth,
                opacity: hours ? 1 : 0.35,
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {hours ?? '—'}
          </ThemedText>
        ) : (
          <TileContent habit={habit} record={record} tileWidth={px.size} tileHeight={px.size} />
        )}
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  number: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlign: 'center',
  },
});
