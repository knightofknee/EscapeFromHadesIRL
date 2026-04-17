import { useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TileGrid } from '@/components/habits/tile-grid';
import { QuickInputModal } from '@/components/ui/quick-input-modal';
import { useHabits } from '@/hooks/use-habits';
import { useTodayRecords } from '@/hooks/use-today-records';
import { useTodayDate } from '@/hooks/use-today-date';
import { useNotes } from '@/hooks/use-notes';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addDays, parseDate } from '@/lib/date-utils';
import type { Habit } from '@/types/habit';

export default function HabitsDayScreen() {
  const { habits, isLoading } = useHabits();
  const { todayStr } = useTodayDate();
  const [viewedDate, setViewedDate] = useState(todayStr);
  const { records, toggleBoolean, cycleTriple, cycleQuad, incrementCounter, setValue } =
    useTodayRecords(viewedDate);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { width: screenWidth } = useWindowDimensions();

  const { createNote } = useNotes();
  const [valueInputHabit, setValueInputHabit] = useState<Habit | null>(null);

  // --- Swipe-to-change-day: Reanimated translateX on the content area ---
  const translateX = useSharedValue(0);
  const isAnimatingOut = useSharedValue(false);
  // Direction of the last commit so we can animate the new day in from
  // the opposite side after viewedDate updates.
  const commitDirectionRef = useRef<'prev' | 'next' | null>(null);

  // Reset to today whenever the screen gains focus or today advances
  useFocusEffect(
    useCallback(() => {
      setViewedDate(todayStr);
      translateX.value = 0;
      isAnimatingOut.value = false;
      commitDirectionRef.current = null;
    }, [todayStr, translateX, isAnimatingOut]),
  );

  // When viewedDate changes from a swipe commit, slide the new content in
  // from the opposite side of the swipe.
  useEffect(() => {
    const dir = commitDirectionRef.current;
    if (dir) {
      // prev: old went off to the right → new comes in from the left
      // next: old went off to the left → new comes in from the right
      translateX.value = dir === 'prev' ? -screenWidth : screenWidth;
      translateX.value = withTiming(0, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      });
      commitDirectionRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedDate]);

  const isToday = viewedDate === todayStr;
  const viewedDateObj = parseDate(viewedDate);

  const commitPrev = useCallback(() => {
    commitDirectionRef.current = 'prev';
    setViewedDate((d) => addDays(d, -1));
  }, []);

  const commitNext = useCallback(() => {
    // Can't go past today
    if (viewedDate >= todayStr) {
      // Spring back — don't commit
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      isAnimatingOut.value = false;
      return;
    }
    commitDirectionRef.current = 'next';
    setViewedDate((d) => addDays(d, 1));
  }, [viewedDate, todayStr, translateX, isAnimatingOut]);

  const resetToday = useCallback(() => {
    setViewedDate(todayStr);
    translateX.value = 0;
  }, [todayStr, translateX]);

  // Swipe: content tracks finger, commits animate off-screen, cancels spring back
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20])
    .onChange((e) => {
      'worklet';
      if (isAnimatingOut.value) return;
      let dx = e.translationX;
      // Rubber band when trying to go past today (no future days allowed)
      // This is a worklet — we check the known value via a closure-captured
      // variable passed from JS (see JS-side check below in commitNext).
      translateX.value = dx;
    })
    .onEnd((e) => {
      'worklet';
      if (isAnimatingOut.value) return;
      const THRESHOLD = screenWidth * 0.28;
      const VELOCITY = 600;
      const wantPrev = e.translationX > THRESHOLD || e.velocityX > VELOCITY;
      const wantNext = e.translationX < -THRESHOLD || e.velocityX < -VELOCITY;

      if (wantPrev) {
        isAnimatingOut.value = true;
        translateX.value = withTiming(
          screenWidth,
          { duration: 200, easing: Easing.in(Easing.cubic) },
          (finished) => {
            'worklet';
            if (finished) {
              isAnimatingOut.value = false;
              runOnJS(commitPrev)();
            }
          },
        );
      } else if (wantNext) {
        isAnimatingOut.value = true;
        translateX.value = withTiming(
          -screenWidth,
          { duration: 200, easing: Easing.in(Easing.cubic) },
          (finished) => {
            'worklet';
            if (finished) {
              isAnimatingOut.value = false;
              runOnJS(commitNext)();
            }
          },
        );
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleTap = useCallback(
    (habitId: string) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      switch (habit.recordingMode) {
        case 'boolean':
          toggleBoolean(habitId);
          break;
        case 'triple':
          cycleTriple(habitId);
          break;
        case 'quad':
          cycleQuad(habitId);
          break;
        case 'counter':
          incrementCounter(habitId);
          break;
        case 'value':
          setValueInputHabit(habit);
          break;
      }
    },
    [habits, toggleBoolean, cycleTriple, cycleQuad, incrementCounter],
  );

  const handleLongPress = useCallback((habitId: string) => {
    router.push({ pathname: '/tile-settings', params: { habitId } });
  }, []);

  const handleValueSubmit = useCallback(
    (value: string) => {
      if (valueInputHabit) {
        setValue(valueInputHabit.id, value);
      }
      setValueInputHabit(null);
    },
    [valueInputHabit, setValue],
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ThemedView style={styles.container}>
        {/* Header stays fixed — only the content area translates on swipe */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <ThemedText type="title" style={styles.headerTitle}>
              {viewedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </ThemedText>
            {!isToday && (
              <Pressable onPress={resetToday} hitSlop={6}>
                <ThemedText style={[styles.notTodayBadge, { color: colors.tint }]}>not today · tap to reset</ThemedText>
              </Pressable>
            )}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.viewLink}
              onPress={() => router.push('/(tabs)/(habits)/week')}
            >
              <ThemedText style={[styles.viewLinkText, { color: colors.tint }]}>Week</ThemedText>
            </Pressable>
            <Pressable
              style={styles.viewLink}
              onPress={() => router.push('/(tabs)/(habits)/month')}
            >
              <ThemedText style={[styles.viewLinkText, { color: colors.tint }]}>Month</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.statsButton, { backgroundColor: colors.tint }]}
              onPress={() => router.push('/(tabs)/(habits)/stats')}
            >
              <ThemedText style={styles.statsButtonText}>📊</ThemedText>
            </Pressable>
          </View>
        </View>

        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={[styles.swipeArea, contentAnimatedStyle]}>
            {habits.length === 0 ? (
              <View style={styles.emptyState}>
                <ThemedText style={styles.emptyText}>No habits yet</ThemedText>
                <Pressable
                  style={[styles.addButton, { backgroundColor: colors.tint }]}
                  onPress={() => router.push({ pathname: '/tile-settings', params: { mode: 'create' } })}
                >
                  <ThemedText style={styles.addButtonText}>+ Add Your First Habit</ThemedText>
                </Pressable>
              </View>
            ) : (
              <>
                {/* Grid fills all available space */}
                <TileGrid
                  habits={habits}
                  records={records}
                  onTapHabit={handleTap}
                  onLongPressHabit={handleLongPress}
                />

                {/* Bottom action buttons */}
                <View style={styles.bottomButtons}>
                  <Pressable
                    style={[styles.addTileButton, { borderColor: colors.tint, backgroundColor: `${colors.tint}15` }]}
                    onPress={() => router.push({ pathname: '/tile-settings', params: { mode: 'create' } })}
                  >
                    <ThemedText style={[styles.addTileText, { color: colors.tint }]}>+ Add Habit</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.addTileButton, { borderColor: colors.tint, backgroundColor: `${colors.tint}15` }]}
                    onPress={async () => {
                      const note = await createNote('');
                      if (note) {
                        router.push(`/(tabs)/(notes)/${note.id}`);
                      }
                    }}
                  >
                    <ThemedText style={[styles.addTileText, { color: colors.tint }]}>+ Add Note</ThemedText>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </GestureDetector>

        <QuickInputModal
          visible={valueInputHabit != null}
          title={valueInputHabit?.name ?? 'Enter Value'}
          onSubmit={handleValueSubmit}
          onCancel={() => setValueInputHabit(null)}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  swipeArea: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
  },
  notTodayBadge: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.85,
    marginTop: 2,
  },
  statsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsButtonText: {
    fontSize: 18,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  viewLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    opacity: 0.6,
  },
  addButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  bottomButtons: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  addTileButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addTileText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
