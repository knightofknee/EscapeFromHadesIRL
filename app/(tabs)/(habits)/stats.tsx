import { useState, useMemo, useCallback } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, ScrollView, TextInput, View, Pressable, useWindowDimensions } from 'react-native';
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
import {
  computeRates,
  computeMonthlyRates,
  computeValueAverages,
  computeMonthlyValueAverages,
  formatStatValue,
  getStatsPageCount,
  isValueTrendHabit,
  monthsOfHistory,
  statsWindowStartDate,
  STATS_DISPLAY_MONTHS,
  STATS_MONTH_QUICK_PICKS,
} from '@/lib/habit-stats';
import { buildStatsHtml } from '@/lib/stats-pdf';
import { nextFrame, renderPdf, sharePdf, type PdfDoc } from '@/lib/pdf-share';
import { PdfPreview } from '@/components/ui/pdf-preview';
import { computeStreak } from '@/lib/habit-streaks';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';

// How far back Stats loads records for streak scans, per step. Bounds the
// per-visit read cost (~3 years); a streak still alive at the window's first
// day loads another step back until it closes or the window reaches the
// earliest habit's creation, so the reported streak is never the window's
// length.
const STREAK_HISTORY_DAYS = 1095;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getTierSuffix(levelIndex: number): string {
  if (levelIndex === 1) return ': Goal';
  if (levelIndex === 2) return ': Ideal';
  return '';
}

// --- Swipeable habit stats section ---

type HabitStatsSectionProps = {
  habit: Habit;
  recordIndex: Map<string, HabitRecord>;
  vacationSet: Set<string>;
  winOnlyWeekends: boolean;
  displayMonths: number;
};

function StatsPageContent({
  habit,
  recordIndex,
  checker,
  colors,
  vacationSet,
  winOnlyWeekends,
  displayMonths,
}: {
  habit: Habit;
  recordIndex: Map<string, HabitRecord>;
  checker: CompletionChecker;
  colors: (typeof Colors)['light'];
  vacationSet: Set<string>;
  winOnlyWeekends: boolean;
  displayMonths: number;
}) {
  // Value habits chart the numeric trend (avg per day) instead of a
  // completion rate — streaks keep the "any entry counts" reading.
  const valueTrend = isValueTrendHabit(habit);

  const { current, longest } = useMemo(
    () => computeStreak(habit, recordIndex, checker, vacationSet, { winOnlyWeekends }),
    [habit, recordIndex, checker, vacationSet, winOnlyWeekends],
  );
  const rates = useMemo(
    () => (valueTrend ? null : computeRates(habit, recordIndex, checker, vacationSet, winOnlyWeekends)),
    [habit, recordIndex, checker, vacationSet, winOnlyWeekends, valueTrend],
  );
  const averages = useMemo(
    () => (valueTrend ? computeValueAverages(habit, recordIndex, vacationSet, winOnlyWeekends) : null),
    [habit, recordIndex, vacationSet, winOnlyWeekends, valueTrend],
  );
  const monthlyData = useMemo(
    () =>
      valueTrend
        ? computeMonthlyValueAverages(habit, recordIndex, displayMonths, vacationSet, winOnlyWeekends)
        : computeMonthlyRates(habit, recordIndex, displayMonths, checker, vacationSet, winOnlyWeekends),
    [habit, recordIndex, checker, vacationSet, winOnlyWeekends, valueTrend, displayMonths],
  );

  return (
    <>
      <View style={styles.statsRow}>
        <StatsCard label="Current Streak" value={current} subtitle="days" color={colors.tileRecorded} />
        <StatsCard label="Longest Streak" value={longest} subtitle="days" color={colors.tileDouble} />
      </View>
      <View style={styles.statsRow}>
        {averages ? (
          <>
            <StatsCard label="7 Days" value={formatStatValue(averages.week)} subtitle="avg/day" />
            <StatsCard label="30 Days" value={formatStatValue(averages.month)} subtitle="avg/day" />
            <StatsCard label="90 Days" value={formatStatValue(averages.quarter)} subtitle="avg/day" />
          </>
        ) : (
          <>
            <StatsCard label="7 Days" value={`${rates!.week}%`} />
            <StatsCard label="30 Days" value={`${rates!.month}%`} />
            <StatsCard label="90 Days" value={`${rates!.quarter}%`} />
          </>
        )}
      </View>
      <StatsChart
        data={monthlyData}
        title={valueTrend ? 'Monthly Average Per Day' : 'Monthly Completion Rate'}
        color={habit.color}
        format={valueTrend ? 'number' : 'percent'}
        displayMonths={displayMonths}
      />
    </>
  );
}

function HabitStatsSection({ habit, recordIndex, vacationSet, winOnlyWeekends, displayMonths }: HabitStatsSectionProps) {
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
  }, [pageCount, changePage, canSwipe, translateX, contentWidth, SWIPE_THRESHOLD]);

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
            carries a Skia chart canvas plus a multi-year streak scan — mounting
            every page of every habit eagerly was the stats tab's dominant
            first-paint cost. The width-fixed wrapper keeps the swipe-row
            translate math identical for unmounted pages. */}
        {Math.abs(i - pageIndex) <= 1 && (
          <View style={styles.statsContent}>
            <StatsPageContent habit={habit} recordIndex={recordIndex} checker={LEVEL_CHECKERS[i]} colors={colors} vacationSet={vacationSet} winOnlyWeekends={winOnlyWeekends} displayMonths={displayMonths} />
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
          {/* Name and tier are separate so a long name ellipsizes while the
              tier (the only text saying which page this is) stays visible. */}
          <View style={styles.habitNameRow}>
            <ThemedText type="defaultSemiBold" style={styles.habitName} numberOfLines={1}>
              {habit.name}
            </ThemedText>
            {pageIndex > 0 && (
              <ThemedText type="defaultSemiBold" style={styles.habitTier}>
                {getTierSuffix(pageIndex)}
              </ThemedText>
            )}
          </View>
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
          <StatsPageContent habit={habit} recordIndex={recordIndex} checker={LEVEL_CHECKERS[0]} colors={colors} vacationSet={vacationSet} winOnlyWeekends={winOnlyWeekends} displayMonths={displayMonths} />
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
  const { habits, isLoading: habitsLoading, isOffline, hasLoaded } = useHabits();
  const { dateSet: vacationSet, isLoading: vacationLoading } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [exporting, setExporting] = useState(false);

  // Keyed on todayStr so the window advances across midnight — frozen at
  // mount, records written after midnight would vanish from recordIndex and
  // every current streak would read as broken.
  const { todayStr } = useTodayDate();
  const today = useMemo(() => parseDate(todayStr), [todayStr]);

  // The earliest habit's creation bounds the data: it is as far back as the
  // streak window ever needs to grow, and the most months the chart can show.
  // Null when no habit carries a usable timestamp.
  const earliestCreatedAt = useMemo(() => {
    let min: number | null = null;
    for (const h of habits) {
      if (!Number.isFinite(h.createdAt) || h.createdAt <= 0) continue;
      if (min === null || h.createdAt < min) min = h.createdAt;
    }
    return min;
  }, [habits]);
  const earliestCreatedDate = earliestCreatedAt === null ? null : formatDate(new Date(earliestCreatedAt));
  const maxMonths = earliestCreatedAt === null ? STATS_DISPLAY_MONTHS : monthsOfHistory(earliestCreatedAt, today);

  // Months window for the charts: quick picks or a typed number, capped at
  // the months of history (All). 18 by default.
  const [chosenMonths, setChosenMonths] = useState<number>(STATS_DISPLAY_MONTHS);
  const [customText, setCustomText] = useState('');
  const displayMonths = Math.min(chosenMonths, maxMonths);
  const pickMonths = (n: number) => {
    setChosenMonths(n);
    setCustomText(String(n));
  };
  const onCustomMonths = (t: string) => {
    const digits = t.replace(/[^0-9]/g, '');
    const n = parseInt(digits, 10);
    if (isNaN(n) || n < 1) {
      setCustomText(digits);
      return;
    }
    // The field shows the number in effect, so a typed value over the cap
    // reads back as the cap.
    const capped = Math.min(maxMonths, n);
    setCustomText(String(capped));
    setChosenMonths(capped);
  };
  const quickPicks = STATS_MONTH_QUICK_PICKS as readonly number[];
  const allActive = displayMonths === maxMonths && !quickPicks.includes(displayMonths);
  const isPresetMonths = quickPicks.includes(displayMonths) || displayMonths === maxMonths;
  const dataSinceLabel =
    earliestCreatedAt === null
      ? null
      : `${MONTH_NAMES[new Date(earliestCreatedAt).getMonth()]} ${new Date(earliestCreatedAt).getFullYear()}`;

  // Streak scans need history, but loading from 2000-01-01 meant every
  // Stats visit re-read the user's ENTIRE records collection (one doc per
  // habit per day → thousands of reads, unbounded as history grows). Load a
  // fixed window instead and grow it in steps only when a streak is still
  // alive at its first day (see the effect below). The window also covers
  // the chosen chart months. The records context's window is a monotonic
  // union, so asking for more is safe.
  const [historyDays, setHistoryDays] = useState(STREAK_HISTORY_DAYS);
  const dateRange = useMemo(() => {
    const streakStart = new Date(today);
    streakStart.setDate(today.getDate() - historyDays);
    const chartStart = statsWindowStartDate(displayMonths, today);
    const streakStartStr = formatDate(streakStart);
    return { startDate: streakStartStr < chartStart ? streakStartStr : chartStart, endDate: todayStr };
  }, [today, todayStr, historyDays, displayMonths]);

  const { records, isLoading: recordsLoading } = useHabitRecords(dateRange.startDate, dateRange.endDate);

  const recordIndex = useMemo(() => {
    const map = new Map<string, HabitRecord>();
    for (const r of records) {
      map.set(`${r.habitId}_${r.date}`, r);
    }
    return map;
  }, [records]);

  // Any habit, at any tier, whose longest streak was still running on the
  // loaded window's first day: it may be longer than what's loaded. Checked
  // only once the current window has delivered, so one extension cannot
  // trigger the next before its data arrives.
  const streakReachesEdge = useMemo(() => {
    if (recordsLoading) return false;
    const scanUntil = dateRange.startDate;
    return habits.some((habit) => {
      const levels = isValueTrendHabit(habit) ? 1 : getStatsPageCount(habit);
      for (let i = 0; i < levels; i++) {
        const { longestOpen } = computeStreak(habit, recordIndex, LEVEL_CHECKERS[i], vacationSet, {
          now: today,
          winOnlyWeekends,
          scanUntil,
        });
        if (longestOpen) return true;
      }
      return false;
    });
  }, [recordsLoading, dateRange.startDate, habits, recordIndex, vacationSet, winOnlyWeekends, today]);

  // Grow the window during render (React's adjust-state-on-change pattern,
  // no effect): the re-render sees the wider range as still loading, so this
  // cannot fire again until that data has arrived. Nothing is recorded
  // before the earliest habit existed, so the window stops growing there.
  if (streakReachesEdge && earliestCreatedDate !== null && dateRange.startDate > earliestCreatedDate) {
    setHistoryDays(historyDays + STREAK_HISTORY_DAYS);
  }

  // Render every habit × success level into a PDF (same computations as
  // the on-screen sections). PDF hands it straight to the share sheet;
  // Preview shows it first, with Share from there.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PdfDoc | null>(null);
  const buildPdf = useCallback(async () => {
    await nextFrame();
    const html = buildStatsHtml({ habits, recordIndex, vacationSet, winOnlyWeekends, scheme: colorScheme, displayMonths });
    return renderPdf(html, 'Habit Statistics');
  }, [habits, recordIndex, vacationSet, winOnlyWeekends, colorScheme, displayMonths]);

  const exportFailed = (e: unknown) => {
    console.error('PDF export failed:', e);
    Alert.alert('Export failed', 'Could not generate the PDF.');
  };

  const handleExportPdf = useCallback(
    async (doc?: PdfDoc | null) => {
      setExporting(true);
      try {
        await sharePdf(doc ?? (await buildPdf()));
      } catch (e) {
        exportFailed(e);
      } finally {
        setExporting(false);
      }
    },
    [buildPdf],
  );

  const handlePreview = useCallback(async () => {
    setPreviewDoc(null);
    setPreviewOpen(true);
    try {
      setPreviewDoc(await buildPdf());
    } catch (e) {
      setPreviewOpen(false);
      exportFailed(e);
    }
  }, [buildPdf]);

  // Hold until habits and the streak history arrive — otherwise every habit
  // section renders zeroed streaks and then pops to the real numbers. Offline
  // before anything loaded keeps the loading treatment; listeners retry on
  // their own.
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
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.windowBlock}>
          <View style={styles.subtitleRow}>
            <ThemedText style={styles.subtitle}>{displayMonths}-month rolling view</ThemedText>
            <View style={styles.pdfButtons}>
              <Pressable
                onPress={handlePreview}
                disabled={exporting || habits.length === 0}
                style={[styles.pdfButton, { borderColor: colors.tileBorder }]}
                hitSlop={6}
                accessibilityLabel="Preview statistics PDF"
              >
                <ThemedText style={[styles.pdfButtonText, { color: colors.icon }]}>Preview</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => handleExportPdf()}
                disabled={exporting || habits.length === 0}
                style={[styles.pdfButton, { borderColor: colors.tileBorder }]}
                hitSlop={6}
                accessibilityLabel="Share statistics as PDF"
              >
                {exporting && !previewOpen ? (
                  <ActivityIndicator size="small" color={colors.icon} />
                ) : (
                  <ThemedText style={[styles.pdfButtonText, { color: colors.icon }]}>PDF</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
          {habits.length > 0 && (
            <View style={styles.monthChooser}>
              <View style={styles.monthChips}>
                {quickPicks.map((n) => {
                  const active = displayMonths === n;
                  const over = n > maxMonths;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => pickMonths(n)}
                      disabled={over}
                      accessibilityLabel={`${n} months`}
                      style={[
                        styles.monthChip,
                        {
                          borderColor: active ? colors.tint : colors.tileBorder,
                          backgroundColor: active ? `${colors.tint}20` : 'transparent',
                          opacity: over ? 0.35 : 1,
                        },
                      ]}
                    >
                      <ThemedText style={styles.monthChipText}>{n}</ThemedText>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => pickMonths(maxMonths)}
                  accessibilityLabel={`All ${maxMonths} months`}
                  style={[
                    styles.monthChip,
                    {
                      borderColor: allActive ? colors.tint : colors.tileBorder,
                      backgroundColor: allActive ? `${colors.tint}20` : 'transparent',
                    },
                  ]}
                >
                  <ThemedText style={styles.monthChipText}>All</ThemedText>
                </Pressable>
                <TextInput
                  style={[
                    styles.monthInput,
                    { color: colors.text, borderColor: !isPresetMonths ? colors.tint : colors.tileBorder },
                  ]}
                  value={customText}
                  placeholder={String(displayMonths)}
                  placeholderTextColor={colors.icon}
                  onChangeText={onCustomMonths}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel="Months to show"
                />
                <ThemedText style={styles.monthInputLabel}>months</ThemedText>
              </View>
              {dataSinceLabel !== null && (
                <ThemedText style={styles.monthHint}>
                  Data since {dataSinceLabel}, up to {maxMonths} months.
                </ThemedText>
              )}
            </View>
          )}
        </View>

        {habits.length === 0 ? (
          <ThemedText style={styles.empty}>No habits to show stats for</ThemedText>
        ) : (
          habits.map((habit) => (
            <HabitStatsSection key={habit.id} habit={habit} recordIndex={recordIndex} vacationSet={vacationSet} winOnlyWeekends={winOnlyWeekends} displayMonths={displayMonths} />
          ))
        )}
      </ScrollView>
      <Modal visible={previewOpen} animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <PdfPreview
          doc={previewDoc}
          backLabel="Done"
          onBack={() => setPreviewOpen(false)}
          onShare={() => handleExportPdf(previewDoc)}
          sharing={exporting}
        />
      </Modal>
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
  windowBlock: {
    gap: 10,
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
  // Same chip + free-field family as the chore editor's frequency picker.
  monthChooser: {
    gap: 6,
  },
  monthChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  monthChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  monthChipText: {
    fontSize: 14,
  },
  monthInput: {
    borderWidth: 1,
    borderRadius: 10,
    width: 56,
    paddingVertical: 6,
    fontSize: 14,
    textAlign: 'center',
  },
  monthInputLabel: {
    fontSize: 14,
  },
  monthHint: {
    fontSize: 12,
    opacity: 0.55,
  },
  // Low-key by design: hairline border + gray text so it reads as a button
  // without competing with the stats content.
  pdfButtons: {
    flexDirection: 'row',
    gap: 8,
  },
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
  habitNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  habitName: {
    fontSize: 18,
    flexShrink: 1,
  },
  habitTier: {
    fontSize: 18,
    flexShrink: 0,
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
