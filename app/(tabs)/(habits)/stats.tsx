import { useState, useMemo, useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, ScrollView, View, Pressable, useWindowDimensions } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { StatsCard } from '@/components/habits/stats-card';
import { StatsChart } from '@/components/habits/stats-chart';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, formatDate } from '@/hooks/use-habit-records';
import { useTodayDate } from '@/hooks/use-today-date';
import { parseDate } from '@/lib/date-utils';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Habit, HabitRecord } from '@/types/habit';
import { LEVEL_CHECKERS } from '@/lib/habit-scoring';
import type { CompletionChecker } from '@/lib/habit-scoring';
import { computeRates, computeMonthlyRates, getStatsPageCount, STATS_DISPLAY_MONTHS } from '@/lib/habit-stats';
import { buildStatsHtml } from '@/lib/stats-pdf';
import { computeStreak } from '@/lib/habit-streaks';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';

// How far back Stats loads records for streak scans. Bounds the per-visit
// read cost; also the maximum detectable streak length. ~3 years.
const STREAK_HISTORY_DAYS = 1095;

function getLevelLabel(habit: Habit, levelIndex: number): string {
  if (levelIndex === 0) return habit.name;
  if (levelIndex === 1) return `${habit.name} — Goal`;
  return `${habit.name} — Ideal`;
}

// --- Swipeable habit stats section ---

type HabitStatsSectionProps = {
  habit: Habit;
  recordIndex: Map<string, HabitRecord>;
  vacationSet: Set<string>;
  winOnlyWeekends: boolean;
};

function StatsPageContent({
  habit,
  recordIndex,
  checker,
  colors,
  vacationSet,
  winOnlyWeekends,
}: {
  habit: Habit;
  recordIndex: Map<string, HabitRecord>;
  checker: CompletionChecker;
  colors: (typeof Colors)['light'];
  vacationSet: Set<string>;
  winOnlyWeekends: boolean;
}) {
  const { current, longest } = useMemo(
    () => computeStreak(habit, recordIndex, checker, vacationSet, { winOnlyWeekends }),
    [habit, recordIndex, checker, vacationSet, winOnlyWeekends],
  );
  const rates = useMemo(
    () => computeRates(habit, recordIndex, checker, vacationSet, winOnlyWeekends),
    [habit, recordIndex, checker, vacationSet, winOnlyWeekends],
  );
  const monthlyData = useMemo(
    () => computeMonthlyRates(habit, recordIndex, STATS_DISPLAY_MONTHS, checker, vacationSet, winOnlyWeekends),
    [habit, recordIndex, checker, vacationSet, winOnlyWeekends],
  );

  return (
    <>
      <View style={styles.statsRow}>
        <StatsCard label="Current Streak" value={current} subtitle="days" color={colors.tileRecorded} />
        <StatsCard label="Longest Streak" value={longest} subtitle="days" color={colors.tileDouble} />
      </View>
      <View style={styles.statsRow}>
        <StatsCard label="7 Days" value={`${rates.week}%`} />
        <StatsCard label="30 Days" value={`${rates.month}%`} />
        <StatsCard label="90 Days" value={`${rates.quarter}%`} />
      </View>
      <StatsChart
        data={monthlyData}
        title="Monthly Completion Rate"
        color={habit.color}
      />
    </>
  );
}

function HabitStatsSection({ habit, recordIndex, vacationSet, winOnlyWeekends }: HabitStatsSectionProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const pageCount = getStatsPageCount(habit);
  const [pageIndex, setPageIndex] = useState(0);

  const translateX = useSharedValue(0);
  const { width: winWidth } = useWindowDimensions();
  const contentWidth = winWidth - 32;
  const SWIPE_THRESHOLD = contentWidth * 0.15;

  const changePage = useCallback((direction: number) => {
    setPageIndex((i) => {
      const next = i + direction;
      if (next < 0 || next >= pageCount) return i;
      return next;
    });
  }, [pageCount]);

  const canSwipe = useCallback((direction: number) => {
    'worklet';
    // direction 1 = swiping left (next page), -1 = swiping right (prev page)
    if (direction === 1) return pageIndex < pageCount - 1;
    return pageIndex > 0;
  }, [pageIndex, pageCount]);

  const swipeGesture = useMemo(() => {
    if (pageCount <= 1) return null;
    return Gesture.Pan()
      .activeOffsetX([-20, 20])
      .failOffsetY([-10, 10])
      .onUpdate((e) => {
        // Clamp drag if at boundary
        const direction = e.translationX < 0 ? 1 : -1;
        if (!canSwipe(direction)) {
          translateX.value = e.translationX * 0.2; // rubber band
        } else {
          translateX.value = e.translationX;
        }
      })
      .onEnd((e) => {
        const direction = e.translationX > 0 ? -1 : 1;
        if (canSwipe(direction) && (Math.abs(e.translationX) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > 500)) {
          // Snap: offset translateX so the row stays at its dragged-to
          // visual position when pageIndex updates, then animate the
          // offset back to 0 — yielding a smooth slide into the new page.
          //
          // Math: rowVisual = -pageIndex * cw + translateX. To preserve
          // visual across a pageIndex change of +direction, translateX
          // must shift by +direction * contentWidth (NOT minus — that
          // was a sign bug that caused the page to "bounce back").
          translateX.value = translateX.value + direction * contentWidth;
          runOnJS(changePage)(direction);
          translateX.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
        } else {
          translateX.value = withTiming(0, { duration: 150 });
        }
      });
  }, [pageCount, pageIndex, changePage, canSwipe, translateX, contentWidth, SWIPE_THRESHOLD]);

  // All pages laid out in a horizontal row; translate the row
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -pageIndex * contentWidth + translateX.value }],
  }));

  const showLeft = pageCount > 1 && pageIndex > 0;
  const showRight = pageCount > 1 && pageIndex < pageCount - 1;

  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(
      <View key={i} style={{ width: contentWidth }}>
        {/* Mount only the active page and its immediate neighbors. Each page
            carries a Skia chart canvas plus a 3-year streak scan — mounting
            every page of every habit eagerly was the stats tab's dominant
            first-paint cost. The width-fixed wrapper keeps the swipe-row
            translate math identical for unmounted pages. */}
        {Math.abs(i - pageIndex) <= 1 && (
          <View style={styles.statsContent}>
            <StatsPageContent habit={habit} recordIndex={recordIndex} checker={LEVEL_CHECKERS[i]} colors={colors} vacationSet={vacationSet} winOnlyWeekends={winOnlyWeekends} />
          </View>
        )}
      </View>,
    );
  }

  return (
    <View style={styles.habitSection}>
      <View style={styles.habitHeader}>
        {showLeft ? (
          <Pressable onPress={() => changePage(-1)} style={styles.navArrow}>
            <ThemedText style={styles.navArrowText}>‹</ThemedText>
          </Pressable>
        ) : pageCount > 1 ? (
          <View style={styles.navArrow} />
        ) : null}
        <View style={styles.habitTitleRow}>
          <ThemedText style={[styles.habitIcon, { color: habit.color }]}>
            {habit.icon ?? habit.abbreviation}
          </ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.habitName} numberOfLines={1}>
            {getLevelLabel(habit, pageIndex)}
          </ThemedText>
        </View>
        {showRight ? (
          <Pressable onPress={() => changePage(1)} style={styles.navArrow}>
            <ThemedText style={styles.navArrowText}>›</ThemedText>
          </Pressable>
        ) : pageCount > 1 ? (
          <View style={styles.navArrow} />
        ) : null}
      </View>

      {pageCount <= 1 ? (
        <View style={styles.statsContent}>
          <StatsPageContent habit={habit} recordIndex={recordIndex} checker={LEVEL_CHECKERS[0]} colors={colors} vacationSet={vacationSet} winOnlyWeekends={winOnlyWeekends} />
        </View>
      ) : (
        <View style={{ overflow: 'hidden', width: contentWidth }}>
          <GestureDetector gesture={swipeGesture!}>
            <Animated.View style={[{ flexDirection: 'row', width: contentWidth * pageCount }, rowStyle]}>
              {pages}
            </Animated.View>
          </GestureDetector>
        </View>
      )}
    </View>
  );
}

// --- Main screen ---

export default function StatsScreen() {
  const { habits, isLoading: habitsLoading, isOffline } = useHabits();
  const { dateSet: vacationSet, isLoading: vacationLoading } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [exporting, setExporting] = useState(false);

  // Streak scans need history, but loading from 2000-01-01 meant every
  // Stats visit re-read the user's ENTIRE records collection (one doc per
  // habit per day → thousands of reads, unbounded as history grows). Cap
  // the load to a fixed window: bounds the read cost, at the price of
  // capping the maximum *detectable* streak to this many days.
  // Keyed on todayStr so the window advances across midnight — frozen at
  // mount, records written after midnight would vanish from recordIndex and
  // every current streak would read as broken.
  const { todayStr } = useTodayDate();
  const dateRange = useMemo(() => {
    const start = parseDate(todayStr);
    start.setDate(start.getDate() - STREAK_HISTORY_DAYS);
    return { startDate: formatDate(start), endDate: todayStr };
  }, [todayStr]);

  const { records, isLoading: recordsLoading } = useHabitRecords(dateRange.startDate, dateRange.endDate);

  const recordIndex = useMemo(() => {
    const map = new Map<string, HabitRecord>();
    for (const r of records) {
      map.set(`${r.habitId}_${r.date}`, r);
    }
    return map;
  }, [records]);

  // Confirm, then render every habit × success level into a PDF (same
  // computations as the on-screen sections) and hand it to the share sheet.
  const handleExportPdf = useCallback(() => {
    Alert.alert('Export PDF?', 'Generate a PDF of all habit statistics?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Export',
        onPress: async () => {
          setExporting(true);
          try {
            // Yield a frame so the spinner actually paints before the
            // synchronous HTML build blocks the JS thread.
            await new Promise((resolve) => setTimeout(resolve, 50));
            const html = buildStatsHtml({ habits, recordIndex, vacationSet, winOnlyWeekends });
            // A4 landscape (points) — fits the 3 success-level columns.
            const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                UTI: 'com.adobe.pdf',
                dialogTitle: 'Habit Statistics',
              });
            }
          } catch (e) {
            console.error('PDF export failed:', e);
            Alert.alert('Export failed', 'Could not generate the PDF.');
          } finally {
            setExporting(false);
          }
        },
      },
    ]);
  }, [habits, recordIndex, vacationSet, winOnlyWeekends]);

  // Hold until habits and the streak history arrive — otherwise every habit
  // section renders zeroed streaks and then pops to the real numbers.
  if (habitsLoading || ((recordsLoading || vacationLoading) && !isOffline)) {
    return <LoadingScreen />;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.subtitleRow}>
          <ThemedText style={styles.subtitle}>18-month rolling view</ThemedText>
          <Pressable
            onPress={handleExportPdf}
            disabled={exporting || habits.length === 0}
            style={[styles.pdfButton, { borderColor: colors.tileBorder }]}
            hitSlop={6}
            accessibilityLabel="Export statistics as PDF"
          >
            {exporting ? (
              <ActivityIndicator size="small" color={colors.icon} />
            ) : (
              <ThemedText style={[styles.pdfButtonText, { color: colors.icon }]}>PDF</ThemedText>
            )}
          </Pressable>
        </View>

        {habits.length === 0 ? (
          <ThemedText style={styles.empty}>
            {isOffline ? 'No internet connection' : 'No habits to show stats for'}
          </ThemedText>
        ) : (
          habits.map((habit) => (
            <HabitStatsSection key={habit.id} habit={habit} recordIndex={recordIndex} vacationSet={vacationSet} winOnlyWeekends={winOnlyWeekends} />
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 24,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -16,
  },
  subtitle: {
    opacity: 0.5,
  },
  // Low-key by design: hairline border + gray text so it reads as a button
  // without competing with the stats content.
  pdfButton: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 44,
    alignItems: 'center',
  },
  pdfButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 40,
    opacity: 0.5,
  },
  habitSection: {
    gap: 10,
  },
  habitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  habitTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  habitIcon: {
    fontSize: 20,
    fontWeight: '700',
  },
  habitName: {
    fontSize: 18,
    flexShrink: 1,
  },
  navArrow: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowText: {
    fontSize: 28,
    fontWeight: '300',
  },
  statsContent: {
    gap: 10,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
});
