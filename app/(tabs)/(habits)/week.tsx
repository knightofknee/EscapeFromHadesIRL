import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, Pressable, View, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { ThemedView } from '@/components/themed-view';
import { WeekGrid } from '@/components/habits/week-grid';
import { SuccessColorPicker } from '@/components/habits/success-color-picker';
import { PhoneFreeSection } from '@/components/habits/phone-free-section';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, getWeekDates } from '@/hooks/use-habit-records';
import { useTodayDate } from '@/hooks/use-today-date';
import { useAuth } from '@/contexts/auth-context';
import { useRecordsContext } from '@/contexts/records-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSuccessColors } from '@/hooks/use-success-colors';
import { useVacationDays } from '@/hooks/use-vacation-days';
import type { TripleValue, QuadValue } from '@/types/habit';
import { isValueRecorded, recordLevel, valueGoalsOn } from '@/lib/habit-scoring';

export default function WeekViewScreen() {
  const { user } = useAuth();
  const { habits, isLoading: habitsLoading, isOffline, hasLoaded } = useHabits();
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const colors = Colors[scheme];
  const { colors: successColors } = useSuccessColors(scheme);
  const { days: vacationDays, isLoading: vacationLoading } = useVacationDays();
  const [weekOffset, setWeekOffset] = useState(0);

  // Anchor "this week" to the live today — a bare new Date() would freeze
  // offset 0 at the mount day across midnight.
  const { todayDate } = useTodayDate();
  const refDate = useMemo(() => {
    const d = new Date(todayDate);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset, todayDate]);

  const { dates } = useMemo(() => getWeekDates(refDate), [refDate]);

  // The weeks either side are rendered too, so a drag reveals them. Their
  // records load with this week's (one range, three weeks).
  const weekDatesAt = useCallback(
    (offset: number) => {
      const d = new Date(todayDate);
      d.setDate(d.getDate() + offset * 7);
      return getWeekDates(d);
    },
    [todayDate],
  );
  const pages = useMemo(
    () => [weekOffset - 1, weekOffset, weekOffset + 1].map((offset) => ({ offset, ...weekDatesAt(offset) })),
    [weekOffset, weekDatesAt],
  );
  const { recordsByDate, isLoading: recordsLoading } = useHabitRecords(pages[0].startDate, pages[2].endDate);
  const { recordHabit } = useRecordsContext();

  const handleTapHabit = useCallback(
    (habitId: string, date: string) => {
      if (!user) return;
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;
      // Steps habits are auto-filled and meditation habits open their own
      // timer modal — neither is editable from the week-view tile tap.
      if (habit.recordingMode === 'steps' || habit.recordingMode === 'meditation') return;

      const existingRecords = recordsByDate[date];
      const existing = existingRecords?.get(habitId);

      let newValue: boolean | TripleValue | QuadValue | number | string;
      switch (habit.recordingMode) {
        case 'boolean':
          newValue = existing ? !existing.value : true;
          break;
        case 'triple': {
          const cur = (existing?.value as TripleValue) ?? 'no';
          newValue = cur === 'no' ? 'yes' : cur === 'yes' ? 'double' : 'no';
          break;
        }
        case 'quad':
        case 'creativeWriting': {
          const cur = (existing?.value as QuadValue) ?? 'no';
          newValue = cur === 'no' ? 'yes' : cur === 'yes' ? 'goal' : cur === 'goal' ? 'ideal' : 'no';
          break;
        }
        case 'counter':
          newValue = ((existing?.value as number) ?? 0) + 1;
          break;
        case 'value': {
          // With goals, a tap climbs to the next goal's amount (like cycling
          // quad tiers) and clears after the top one.
          const goals = valueGoalsOn(habit, date);
          if (goals.length > 0) {
            const level = recordLevel(habit, existing);
            newValue = level < goals.length ? String(goals[level]) : '';
            break;
          }
          // Without goals, just toggle presence. isValueRecorded, not
          // truthiness: a "0" cell renders unrecorded, so tapping it must
          // record ("1"), not clear an already-empty-looking cell.
          newValue = isValueRecorded(existing?.value) ? '' : '1';
          break;
        }
      }

      // Through the shared context path: optimistic local update, plus the
      // same offline guard every other mutation has (a direct setDoc here
      // bypassed both).
      recordHabit(habitId, date, newValue);
    },
    [user, habits, recordsByDate, recordHabit],
  );

  // Horizontal pager over the three weeks. Pages sit at x = offset * width
  // and the row is translated by -position * width, where position is the
  // week on screen in page units (plus the live drag). A swipe animates
  // position to the neighbour, and only then commits the new offset: the
  // commit moves the pages under an unchanged translate, so nothing jumps
  // or resets between the animation and the re-render.
  const { width: screenWidth } = useWindowDimensions();
  const position = useSharedValue(0);
  // Where a drag began, in page units: a grab mid-animation continues from
  // there instead of snapping back to the committed week.
  const dragStart = useSharedValue(0);
  const [pagerHeight, setPagerHeight] = useState(0);

  const commitWeek = useCallback((offset: number) => {
    setWeekOffset(offset);
  }, []);

  const settleTo = useCallback(
    (offset: number) => {
      position.value = withTiming(
        offset,
        { duration: 220, easing: Easing.out(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(commitWeek)(offset);
        },
      );
    },
    [position, commitWeek],
  );

  // The arrows step from where the pager is, not from the committed week,
  // so two quick taps move two weeks instead of re-targeting the same one.
  const step = useCallback(
    (direction: number) => settleTo(Math.round(position.value) + direction),
    [settleTo, position],
  );

  const jumpTo = useCallback(
    (offset: number) => {
      if (Math.abs(offset - Math.round(position.value)) === 1) {
        settleTo(offset);
        return;
      }
      position.value = offset;
      setWeekOffset(offset);
    },
    [settleTo, position],
  );

  // Memoized — rebuilt-per-render gesture objects churn the gesture handler.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-10, 10])
        .onStart(() => {
          dragStart.value = position.value;
        })
        .onUpdate((e) => {
          position.value = dragStart.value - e.translationX / screenWidth;
        })
        .onEnd((e) => {
          const from = Math.round(dragStart.value);
          const far = Math.abs(e.translationX) > screenWidth * 0.2;
          const fast = Math.abs(e.velocityX) > 500;
          const direction = e.translationX > 0 ? -1 : 1;
          runOnJS(settleTo)(far || fast ? from + direction : from);
        }),
    [screenWidth, position, dragStart, settleTo],
  );

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -position.value * screenWidth }],
  }));

  const weekLabel = useMemo(() => {
    const start = dates[0];
    const end = dates[6];
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [dates]);

  // Hold until habits and this week's records arrive — otherwise the grid
  // renders all-empty cells and then pops to the real data. Offline before
  // anything loaded keeps the loading treatment; listeners retry on their own.
  if (
    habitsLoading ||
    ((recordsLoading || vacationLoading) && !isOffline) ||
    // hasLoaded, not habits.length: an account CONFIRMED empty keeps its
    // normal empty state (with its setup affordances) when the device goes
    // offline — only "offline before anything ever loaded" waits here.
    (isOffline && !hasLoaded)
  ) {
    return <LoadingScreen message={isOffline ? 'Waiting for connection...' : undefined} />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => step(-1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>‹</ThemedText>
          </Pressable>
          <Pressable onPress={() => jumpTo(0)}>
            <ThemedText type="defaultSemiBold" style={styles.weekLabel}>
              {weekLabel}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => step(1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>›</ThemedText>
          </Pressable>
        </View>

        {/* replace, not back(): history-walking lands on surprising siblings
            after deep links — see the back-to-parent invariant. */}
        <Pressable style={styles.backLink} onPress={() => router.replace('/(tabs)/(habits)')}>
          <ThemedText style={[styles.backText, { color: colors.tint }]}>← Day View</ThemedText>
        </Pressable>

        {habits.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ThemedText style={{ opacity: 0.5, fontSize: 16 }}>No habits yet</ThemedText>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
            <GestureDetector gesture={swipeGesture}>
              <View style={[styles.pager, pagerHeight > 0 && { height: pagerHeight }]}>
                <Animated.View style={pagerStyle}>
                  {pages.map((page) => (
                    <View
                      key={page.offset}
                      style={[styles.page, { width: screenWidth, left: page.offset * screenWidth }]}
                      onLayout={
                        page.offset === weekOffset
                          ? (e) => setPagerHeight(e.nativeEvent.layout.height)
                          : undefined
                      }
                    >
                      <WeekGrid
                        dates={page.dates}
                        habits={habits}
                        recordsByDate={recordsByDate}
                        onTapHabit={handleTapHabit}
                        successColors={successColors}
                        vacationDays={vacationDays}
                      />
                    </View>
                  ))}
                </Animated.View>
              </View>
            </GestureDetector>
            <SuccessColorPicker />
            {/* Provisional home for phone-free nights (user: "below the legend,
                worry about ideal UI later", 2026-11-03). */}
            <PhoneFreeSection dates={dates} />
          </ScrollView>
        )}
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
  pager: {
    overflow: 'hidden',
  },
  page: {
    position: 'absolute',
    top: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navText: {
    fontSize: 28,
    fontWeight: '300',
  },
  weekLabel: {
    fontSize: 16,
  },
  backLink: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
