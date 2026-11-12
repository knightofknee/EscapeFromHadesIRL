import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { WeekColumn } from './week-column';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { parseDate } from '@/lib/date-utils';
import type { Habit, HabitRecord, VacationDay } from '@/types/habit';
import type { SuccessColors } from '@/hooks/use-success-colors';

/** Seven columns fill the strip; the strip's padding and the gap between columns. */
export const STRIP_PADDING = 4;
export const COLUMN_GAP = 2;
export const VISIBLE_DAYS = 7;

/** Width of one day's slot (column plus its gap) when seven fill `stripWidth`. */
export function daySlotWidth(stripWidth: number): number {
  return (stripWidth - STRIP_PADDING * 2 - COLUMN_GAP * (VISIBLE_DAYS - 1)) / VISIBLE_DAYS + COLUMN_GAP;
}

type DayStripProps = {
  /** Every day the strip can show, oldest first, YYYY-MM-DD. */
  days: string[];
  todayStr: string;
  width: number;
  habits: Habit[];
  recordsByDate: Record<string, Map<string, HabitRecord>>;
  onTapHabit: (habitId: string, date: string) => void;
  successColors: SuccessColors;
  vacationDays?: Map<string, VacationDay>;
  /** Index of the leftmost day to show first. */
  initialIndex: number;
  /** Called whenever the leftmost visible day changes, during the scroll. */
  onFirstVisibleChange: (index: number) => void;
};

export type DayStripHandle = { scrollToIndex: (index: number, animated?: boolean) => void };

/**
 * The week view's days as one continuous horizontal strip. It scrolls
 * freely and settles on whole days, so the user can shift by one day or
 * fifty; nothing pages in week chunks. Seven columns fit the width, sized
 * exactly as the old fixed week grid was.
 */
export function DayStrip({
  days,
  todayStr,
  width,
  habits,
  recordsByDate,
  onTapHabit,
  successColors,
  vacationDays,
  initialIndex,
  onFirstVisibleChange,
  handleRef,
}: DayStripProps & { handleRef: React.MutableRefObject<DayStripHandle | null> }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const listRef = useRef<FlatList<string>>(null);
  const slot = daySlotWidth(width);
  const emptyMap = useRef(new Map<string, HabitRecord>()).current;
  const lastFirst = useRef(initialIndex);
  const maxIndex = Math.max(0, days.length - VISIBLE_DAYS);

  useEffect(() => {
    handleRef.current = {
      scrollToIndex: (index, animated = true) => {
        listRef.current?.scrollToIndex({
          index: Math.min(maxIndex, Math.max(0, index)),
          animated,
        });
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, maxIndex]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const first = Math.min(maxIndex, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / slot)));
      if (first !== lastFirst.current) {
        lastFirst.current = first;
        onFirstVisibleChange(first);
      }
    },
    [slot, maxIndex, onFirstVisibleChange],
  );

  // Offsets are plain multiples of `slot`, the same grid the native snapping
  // uses, so scrollToIndex lands exactly where a drag would settle. (The
  // strip's padding sits in the list ends, outside these offsets.)
  const getItemLayout = useCallback(
    (_: ArrayLike<string> | null | undefined, index: number) => ({
      length: slot,
      offset: index * slot,
      index,
    }),
    [slot],
  );

  const renderItem = useCallback(
    ({ item: dateStr }: ListRenderItemInfo<string>) => (
      <View style={{ width: slot, paddingHorizontal: COLUMN_GAP / 2 }}>
        <WeekColumn
          date={parseDate(dateStr)}
          isToday={dateStr === todayStr}
          habits={habits}
          records={recordsByDate[dateStr] ?? emptyMap}
          onTapHabit={onTapHabit}
          successColors={successColors}
          vacation={vacationDays?.get(dateStr)}
        />
      </View>
    ),
    [slot, todayStr, habits, recordsByDate, onTapHabit, successColors, vacationDays, emptyMap],
  );

  // The strip's side padding, as list ends.
  const edge = useMemo(() => <View style={{ width: STRIP_PADDING - COLUMN_GAP / 2 }} />, []);

  return (
    <View style={[styles.strip, { backgroundColor: colors.gridBackground, width }]}>
      <FlatList
        ref={listRef}
        horizontal
        data={days}
        keyExtractor={(d) => d}
        renderItem={renderItem}
        getItemLayout={getItemLayout}
        initialScrollIndex={Math.min(maxIndex, Math.max(0, initialIndex))}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={slot}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={false}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        ListHeaderComponent={edge}
        ListFooterComponent={edge}
        initialNumToRender={VISIBLE_DAYS * 2}
        maxToRenderPerBatch={VISIBLE_DAYS * 2}
        windowSize={5}
        contentContainerStyle={styles.content}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    borderRadius: 8,
    paddingVertical: STRIP_PADDING,
    overflow: 'hidden',
  },
  content: {
    minHeight: 300 - STRIP_PADDING * 2,
  },
});
