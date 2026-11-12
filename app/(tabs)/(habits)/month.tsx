import { useState, useMemo, useRef, useCallback } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Pressable, Switch, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { ThemedView } from '@/components/themed-view';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords } from '@/hooks/use-habit-records';
import { useTodayDate } from '@/hooks/use-today-date';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';
import { useSuccessColors } from '@/hooks/use-success-colors';
import { useAuth } from '@/contexts/auth-context';
import { useRecordsContext } from '@/contexts/records-context';
import { computeDayBreakdown, heatmapShade } from '@/lib/day-breakdown';
import { DayBreakdownPopover, type PopoverAnchor } from '@/components/habits/day-breakdown-popover';
import {
  computeRangeRows,
  formatMonthAmount,
  maxMonthPage,
  monthPage,
  rangeCalendarWeeks,
} from '@/lib/month-habit-stats';
import { buildMonthReportHtml, monthReportLabel, monthReportRange, REPORT_WEEKS } from '@/lib/month-pdf';
import { MonthPickerModal, type MonthPickerOption } from '@/components/habits/month-picker-modal';
import { loadRecordsRange, mergeWithLive } from '@/lib/records-snapshot-store';
import { nextFrame, renderPdf, sharePdf, type PdfDoc } from '@/lib/pdf-share';
import { MonthSparkline } from '@/components/habits/month-sparkline';
import { PdfPreview } from '@/components/ui/pdf-preview';
import { readableTextOn } from '@/lib/contrast';
import { formatDate, parseDate, weekStartOf, weekdayOrder, WEEKDAY_SHORT } from '@/lib/date-utils';
import { useWeekStart } from '@/hooks/use-week-start';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { HabitRecord } from '@/types/habit';


export default function MonthViewScreen() {
  const { habits, isLoading: habitsLoading, isOffline, hasLoaded } = useHabits();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [monthOffset, setMonthOffset] = useState(0);
  const { days: vacationDays, dateSet: vacationSet, isLoading: vacationLoading } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();
  const { weekStartsOn } = useWeekStart();

  // todayDate keeps "this month" / "yesterday" live across midnight and
  // foreground returns — a bare new Date() here would freeze at mount.
  const { todayDate, todayStr } = useTodayDate();

  // Page 0 is the past month ending today; forward of it is only the
  // current month so far (lib/month-habit-stats monthPage). Nothing lies
  // past that, so the forward button disappears there instead of paging
  // into months that haven't happened.
  const maxOffset = maxMonthPage(todayDate);
  // Nothing exists before the month the first habit was created in, so the
  // back arrow stops there instead of paging into empty months.
  const firstHabitAt = useMemo(
    () =>
      habits.reduce(
        (min, h) => (h.createdAt && h.createdAt < min ? h.createdAt : min),
        Number.POSITIVE_INFINITY,
      ),
    [habits],
  );
  const minOffset = useMemo(() => {
    if (!Number.isFinite(firstHabitAt)) return 0;
    const c = new Date(firstHabitAt);
    return -Math.max(0, (todayDate.getFullYear() - c.getFullYear()) * 12 + (todayDate.getMonth() - c.getMonth()));
  }, [firstHabitAt, todayDate]);
  const shownOffset = Math.min(Math.max(monthOffset, minOffset), maxOffset);
  const page = useMemo(() => monthPage(shownOffset, todayDate), [shownOffset, todayDate]);
  const { year, month, startDate, endDate, dates, countDates, label: monthLabel } = page;
  const dayCount = dates.length;
  const canGoForward = shownOffset < maxOffset;
  const canGoBack = shownOffset > minOffset;
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerOptions = useMemo<MonthPickerOption[]>(() => {
    const out: MonthPickerOption[] = [];
    for (let o = maxOffset; o >= minOffset; o--) {
      const p = monthPage(o, todayDate);
      out.push({ offset: o, label: o === 0 && p.kind === 'trailing' ? `Past month, ${p.label}` : p.label });
    }
    return out;
  }, [maxOffset, minOffset, todayDate]);

  const { records, isLoading: recordsLoading } = useHabitRecords(startDate, endDate);

  // Index records by habitId_date for O(1) lookups
  const recordIndex = useMemo(() => {
    const map = new Map<string, HabitRecord>();
    for (const r of records) {
      map.set(`${r.habitId}_${r.date}`, r);
    }
    return map;
  }, [records]);

  // Build calendar grid
  const calendarWeeks = useMemo(() => rangeCalendarWeeks(dates, weekStartsOn), [dates, weekStartsOn]);

  // Per-habit month stats (lib/month-habit-stats): completion rate, the
  // total/average/median trio for amount habits (value, steps, meditation
  // minutes), and the sparkline series. Vacation days and weekend
  // non-completions leave the month entirely; with the per-habit
  // weekend-skip rule each habit can have its own denominator.
  const habitRates = useMemo(
    () => computeRangeRows(habits, recordIndex, countDates, vacationSet, winOnlyWeekends),
    [habits, recordIndex, countDates, vacationSet, winOnlyWeekends],
  );

  // Heatmap data: each day's weighted habit score (see lib/day-breakdown
  // for the weights). Vacation days are skipped — they render as the
  // vacation tile, not part of the heatmap.
  const breakdownFor = useCallback(
    (dateStr: string) =>
      computeDayBreakdown(
        habits,
        dateStr,
        (habit) => recordIndex.get(`${habit.id}_${dateStr}`),
        winOnlyWeekends,
      ),
    [habits, recordIndex, winOnlyWeekends],
  );
  const dayCompletionMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (habits.length === 0) return map;
    for (const d of dates) {
      if (vacationSet.has(d)) continue;
      map[d] = breakdownFor(d).ratio;
    }
    return map;
  }, [habits.length, breakdownFor, dates, vacationSet]);

  // Tap a day to see what's behind its shade. The cell is measured against
  // the screen container so the popover can sit right above it. Any touch
  // on the container closes it (touches still reach the cells, so a tap on
  // another day closes this one AND opens that one).
  const containerRef = useRef<View>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const cellRefs = useRef(new Map<string, View | null>());
  const [popover, setPopover] = useState<{ day: string; anchor: PopoverAnchor } | null>(null);
  // The day whose popover this touch just closed: tapping it again is a
  // toggle, so its press must not reopen it.
  const closedByTouchRef = useRef<string | null>(null);
  const openDay = useCallback((day: string) => {
    if (closedByTouchRef.current === day) {
      closedByTouchRef.current = null;
      return;
    }
    const cell = cellRefs.current.get(day);
    const container = containerRef.current;
    if (!cell || !container) return;
    container.measureInWindow((cx, cy) => {
      cell.measureInWindow((x, y, width, height) => {
        setPopover({ day, anchor: { x: x - cx, y: y - cy, width, height } });
      });
    });
  }, []);
  const popoverBreakdown = useMemo(
    () => (popover ? breakdownFor(popover.day) : null),
    [popover, breakdownFor],
  );
  const popoverTitle = popover
    ? parseDate(popover.day).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '';

  function heatmapColor(ratio: number): string {
    return heatmapShade(ratio, colors.tileRecorded, colors.tileUnrecorded);
  }

  // --- Share as PDF (the export section at the bottom) ---
  // The report can reach past this month (older months, the last 4 weeks),
  // so it reads its own span instead of this screen's month of records.
  const { user } = useAuth();
  const { recordsMap, loadedRange } = useRecordsContext();
  // The PDF wears the app's theme, so it looks like this screen.
  const { colors: successColors } = useSuccessColors(colorScheme);
  const [shareMonths, setShareMonths] = useState(1);
  const [shareMonthsText, setShareMonthsText] = useState('1');
  const [shareWeeks, setShareWeeks] = useState(true);
  const [shareWeekCount, setShareWeekCount] = useState(REPORT_WEEKS);
  const [shareWeekText, setShareWeekText] = useState(String(REPORT_WEEKS));
  const [sharing, setSharing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PdfDoc | null>(null);
  // How far back the report can reach: every month from the one the first
  // habit was created in through the month on screen. That is the only
  // limit; any count up to it can be typed.
  const dataMonths = useMemo(() => {
    const created = habits.reduce(
      (min, h) => (h.createdAt && h.createdAt < min ? h.createdAt : min),
      Number.POSITIVE_INFINITY,
    );
    if (!Number.isFinite(created)) return 1;
    const c = new Date(created);
    return Math.max(1, (year - c.getFullYear()) * 12 + (month - c.getMonth()) + 1);
  }, [habits, year, month]);
  const dataSince = useMemo(() => {
    const d = new Date(year, month - (dataMonths - 1), 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [year, month, dataMonths]);
  const monthsInReport = Math.min(shareMonths, dataMonths);
  // Weeks of data: from the start of the first habit's week through today.
  const dataWeeks = useMemo(() => {
    if (!Number.isFinite(firstHabitAt)) return 1;
    const start = weekStartOf(formatDate(new Date(firstHabitAt)), weekStartsOn);
    const days = Math.round((parseDate(todayStr).getTime() - parseDate(start).getTime()) / 86_400_000) + 1;
    return Math.max(1, Math.ceil(days / 7));
  }, [firstHabitAt, todayStr, weekStartsOn]);
  const weeksInReport = Math.min(shareWeekCount, dataWeeks);
  const pickWeeks = (n: number) => {
    const clamped = Math.min(Math.max(1, n), dataWeeks);
    setShareWeekCount(clamped);
    setShareWeekText(String(clamped));
  };
  // The quick picks always show; ones past the data are dimmed. "All" is
  // the whole span when that isn't already one of them.
  const quickMonthChoices = useMemo(
    () => (SHARE_MONTH_CHOICES.includes(dataMonths) ? SHARE_MONTH_CHOICES : [...SHARE_MONTH_CHOICES, dataMonths]),
    [dataMonths],
  );
  const pickMonths = (n: number) => {
    const clamped = Math.min(Math.max(1, n), dataMonths);
    setShareMonths(clamped);
    setShareMonthsText(String(clamped));
  };
  const shareOpts = { year, month, monthCount: monthsInReport, includeWeeks: shareWeeks, weekCount: weeksInReport };
  const shareLabel = monthReportLabel(shareOpts);

  const buildReport = async (): Promise<PdfDoc> => {
    if (!user) throw new Error('signed out');
    await nextFrame();
    const range = monthReportRange(shareOpts, todayDate, weekStartsOn);
    // No records exist past today; clamping lets the saved snapshot cover it.
    const end = range.endDate > todayStr ? todayStr : range.endDate;
    const fetched = await loadRecordsRange(user.uid, range.startDate, end);
    const index = new Map<string, HabitRecord>();
    for (const r of mergeWithLive(fetched, recordsMap.values(), loadedRange, range.startDate, end)) {
      index.set(`${r.habitId}_${r.date}`, r);
    }
    const html = buildMonthReportHtml(
      {
        habits,
        recordIndex: index,
        vacationDays,
        winOnlyWeekends,
        successColors,
        today: todayDate,
        scheme: colorScheme,
        weekStartsOn,
      },
      shareOpts,
    );
    return renderPdf(html, `${shareLabel} Habits`);
  };

  const reportFailed = (e: unknown) => {
    console.error('Month PDF failed:', e);
    Alert.alert('Export failed', 'Could not make the PDF. Check your connection and try again.');
  };

  const handlePreview = async () => {
    setPreviewDoc(null);
    setPreviewOpen(true);
    try {
      setPreviewDoc(await buildReport());
    } catch (e) {
      setPreviewOpen(false);
      reportFailed(e);
    }
  };

  const handleShare = async (doc?: PdfDoc | null) => {
    setSharing(true);
    try {
      await sharePdf(doc ?? (await buildReport()));
    } catch (e) {
      reportFailed(e);
    } finally {
      setSharing(false);
    }
  };

  // Hold until habits and this month's records arrive — otherwise the
  // heatmap renders all-empty and then pops to the real data. Offline before
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
      <View
        ref={containerRef}
        style={styles.container}
        onLayout={(e) => setBounds(e.nativeEvent.layout)}
        onTouchStart={() => {
          closedByTouchRef.current = popover?.day ?? null;
          if (popover) setPopover(null);
        }}
      >
        <View style={styles.header}>
          {canGoBack ? (
            <Pressable
              onPress={() => setMonthOffset(shownOffset - 1)}
              style={styles.navButton}
              accessibilityRole="button"
              accessibilityLabel="Back a month"
            >
              <ThemedText style={styles.navText}>‹</ThemedText>
            </Pressable>
          ) : (
            <View style={styles.navButton} />
          )}
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Choose a month"
          >
            <ThemedText type="defaultSemiBold" style={styles.monthLabel}>{monthLabel}</ThemedText>
          </Pressable>
          {canGoForward ? (
            <Pressable
              onPress={() => setMonthOffset(shownOffset + 1)}
              style={styles.navButton}
              accessibilityRole="button"
              accessibilityLabel="Forward a month"
            >
              <ThemedText style={styles.navText}>›</ThemedText>
            </Pressable>
          ) : (
            <View style={styles.navButton} />
          )}
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
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bottomOffset={24}
        >
          {/* Calendar heatmap */}
          <View style={styles.calendarSection}>
            <View style={styles.weekdayHeaders}>
              {weekdayOrder(weekStartsOn).map((d) => (
                <ThemedText key={d} style={styles.weekdayLabel}>{WEEKDAY_SHORT[d][0]}</ThemedText>
              ))}
            </View>
            {calendarWeeks.map((week, wi) => (
              <View key={wi} style={styles.calendarRow}>
                {week.map((dateStr, di) => {
                  if (!dateStr) {
                    return <View key={di} style={styles.calendarCell} />;
                  }
                  const day = parseDate(dateStr).getDate();
                  const vacation = vacationDays.get(dateStr);
                  // Vacation cells use the user's chosen vacation color and
                  // show a V (or first char of a custom label) — they're not
                  // part of the heatmap math.
                  if (vacation) {
                    const initial = (vacation.label.trim() || 'V')[0];
                    const fg = readableTextOn(vacation.color);
                    return (
                      <View
                        key={di}
                        style={[styles.calendarCell, { backgroundColor: vacation.color }]}
                      >
                        <ThemedText style={[styles.calendarDayText, { color: fg, fontWeight: '700' }]}>
                          {initial}
                        </ThemedText>
                      </View>
                    );
                  }
                  return (
                    <Pressable
                      key={di}
                      ref={(node) => {
                        cellRefs.current.set(dateStr, node);
                      }}
                      onPress={() => openDay(dateStr)}
                      accessibilityRole="button"
                      accessibilityLabel={`${parseDate(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, see habit breakdown`}
                      style={[
                        styles.calendarCell,
                        { backgroundColor: heatmapColor(dayCompletionMap[dateStr] ?? 0) },
                      ]}
                    >
                      <ThemedText style={styles.calendarDayText}>{day}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Per-habit rates */}
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Habit Completion
          </ThemedText>
          {habitRates.map(({ habit, completed, activeDays, rate, amount, series, yMax }) => (
            <View key={habit.id} style={[styles.habitRow, { borderColor: colors.tileBorder }]}>
              <View style={styles.habitInfo}>
                <ThemedText style={[styles.habitAbbr, { color: habit.color }]}>
                  {habit.icon ?? habit.abbreviation}
                </ThemedText>
                <ThemedText style={styles.habitName}>{habit.name}</ThemedText>
              </View>
              <View style={styles.habitStats}>
                <View>
                  <ThemedText style={styles.rateText}>{rate == null ? '—' : `${rate}%`}</ThemedText>
                  <ThemedText style={styles.countText}>
                    {completed}/{activeDays} days
                  </ThemedText>
                </View>
                {amount && (
                  <View style={styles.amountTrio}>
                    <AmountStat label="avg/day" value={formatMonthAmount(amount, amount.average)} />
                    {amount.showMedian && (
                      <AmountStat label="median" value={formatMonthAmount(amount, amount.median)} />
                    )}
                    <AmountStat label="total" value={formatMonthAmount(amount, amount.total)} />
                  </View>
                )}
              </View>
              <MonthSparkline
                id={habit.id}
                color={habit.color}
                series={series}
                yMax={yMax}
                daysInMonth={dayCount}
                baselineColor={colors.tileUnrecorded}
              />
            </View>
          ))}

          {/* Share: below everything else on the screen. */}
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Share
          </ThemedText>
          <View style={[styles.habitRow, styles.shareCard, { borderColor: colors.tileBorder }]}>
            <View style={styles.shareRow}>
              <ThemedText style={styles.shareLabel}>Months</ThemedText>
              <View style={styles.chips}>
                {quickMonthChoices.map((n) => {
                  const on = n === monthsInReport;
                  const all = n === dataMonths && !SHARE_MONTH_CHOICES.includes(n);
                  const beyondData = n > dataMonths;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => pickMonths(n)}
                      disabled={beyondData}
                      style={[
                        styles.chip,
                        { borderColor: on ? colors.tint : colors.tileBorder },
                        on && { backgroundColor: colors.tint },
                        beyondData && styles.chipOff,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on, disabled: beyondData }}
                      accessibilityLabel={all ? `All ${n} months` : `${n} ${n === 1 ? 'month' : 'months'}`}
                    >
                      <ThemedText style={[styles.chipText, on && styles.chipTextOn]}>{all ? 'All' : n}</ThemedText>
                    </Pressable>
                  );
                })}
                <TextInput
                  style={[styles.monthsInput, { color: colors.text, borderColor: colors.tileBorder }]}
                  value={shareMonthsText}
                  onChangeText={(t) => {
                    const digits = t.replace(/[^0-9]/g, '');
                    setShareMonthsText(digits);
                    const n = parseInt(digits, 10);
                    if (n >= 1) setShareMonths(Math.min(n, dataMonths));
                  }}
                  onBlur={() => setShareMonthsText(String(monthsInReport))}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                  maxLength={3}
                  accessibilityLabel="Number of months"
                />
              </View>
            </View>
            <ThemedText style={styles.shareSub}>
              {dataMonths === 1 ? `Data since ${dataSince}, 1 month.` : `Data since ${dataSince}, up to ${dataMonths} months.`}
            </ThemedText>
            <View style={styles.shareRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.shareLabel}>Recent weeks</ThemedText>
                <ThemedText style={styles.shareSub}>Adds the week view for the last weeks</ThemedText>
              </View>
              <Switch
                value={shareWeeks}
                onValueChange={setShareWeeks}
                trackColor={{ false: colorScheme === 'dark' ? '#5A5E66' : '#D8DBE0', true: colors.tint }}
                ios_backgroundColor={colorScheme === 'dark' ? '#5A5E66' : '#D8DBE0'}
                thumbColor="#fff"
              />
            </View>
            {shareWeeks && (
              <View style={styles.shareRow}>
                <ThemedText style={styles.shareLabel}>Weeks</ThemedText>
                <View style={styles.chips}>
                  {SHARE_WEEK_CHOICES.map((n) => {
                    const on = n === weeksInReport;
                    const beyondData = n > dataWeeks;
                    return (
                      <Pressable
                        key={n}
                        onPress={() => pickWeeks(n)}
                        disabled={beyondData}
                        style={[
                          styles.chip,
                          { borderColor: on ? colors.tint : colors.tileBorder },
                          on && { backgroundColor: colors.tint },
                          beyondData && styles.chipOff,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on, disabled: beyondData }}
                        accessibilityLabel={`${n} ${n === 1 ? 'week' : 'weeks'}`}
                      >
                        <ThemedText style={[styles.chipText, on && styles.chipTextOn]}>{n}</ThemedText>
                      </Pressable>
                    );
                  })}
                  <TextInput
                    style={[styles.monthsInput, { color: colors.text, borderColor: colors.tileBorder }]}
                    value={shareWeekText}
                    onChangeText={(t) => {
                      const digits = t.replace(/[^0-9]/g, '');
                      setShareWeekText(digits);
                      const n = parseInt(digits, 10);
                      if (n >= 1) setShareWeekCount(Math.min(n, dataWeeks));
                    }}
                    onBlur={() => setShareWeekText(String(weeksInReport))}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                    maxLength={3}
                    accessibilityLabel="Number of weeks"
                  />
                </View>
              </View>
            )}
            <ThemedText style={styles.shareSub}>{shareLabel}</ThemedText>
            <View style={styles.shareButtons}>
              <Pressable
                onPress={handlePreview}
                disabled={sharing}
                style={[styles.shareButton, { borderColor: colors.tileBorder }]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.shareButtonText}>Preview</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => handleShare()}
                disabled={sharing}
                style={[styles.shareButton, { borderColor: colors.tint, backgroundColor: colors.tint }]}
                accessibilityRole="button"
              >
                {sharing && !previewOpen ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={[styles.shareButtonText, styles.chipTextOn]}>Share PDF</ThemedText>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
        )}
        <MonthPickerModal
          visible={pickerOpen}
          options={pickerOptions}
          current={shownOffset}
          onPick={setMonthOffset}
          onClose={() => setPickerOpen(false)}
        />
        <DayBreakdownPopover
          anchor={popover?.anchor ?? null}
          bounds={bounds}
          title={popoverTitle}
          breakdown={popoverBreakdown}
        />
      </View>
      </ThemedView>
      <Modal visible={previewOpen} animationType="slide" onRequestClose={() => setPreviewOpen(false)}>
        <PdfPreview
          doc={previewDoc}
          backLabel="Done"
          onBack={() => setPreviewOpen(false)}
          onShare={() => handleShare(previewDoc)}
          sharing={sharing}
        />
      </Modal>
    </SafeAreaView>
  );
}

const SHARE_MONTH_CHOICES = [1, 3, 6, 12];
const SHARE_WEEK_CHOICES = [2, 4, 8];

function AmountStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.amountStat}>
      <ThemedText style={styles.amountValue} numberOfLines={1}>{value}</ThemedText>
      <ThemedText style={styles.amountLabel}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  navButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  navText: { fontSize: 28, fontWeight: '300' },
  monthLabel: { fontSize: 18 },
  backLink: { paddingHorizontal: 16, paddingBottom: 8 },
  backText: { fontSize: 14, fontWeight: '600' },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 16 },
  calendarSection: { gap: 4 },
  weekdayHeaders: { flexDirection: 'row', gap: 4 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 12, opacity: 0.5, fontWeight: '600' },
  calendarRow: { flexDirection: 'row', gap: 4 },
  calendarCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayText: { fontSize: 11, fontWeight: '500' },
  sectionTitle: { fontSize: 16, marginTop: 8 },
  habitRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  habitInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  habitAbbr: { fontSize: 16, fontWeight: '700' },
  habitName: { fontSize: 14 },
  habitStats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  rateText: { fontSize: 20, fontWeight: '700' },
  countText: { fontSize: 13, opacity: 0.5 },
  amountTrio: { flexDirection: 'row', gap: 16, flexShrink: 1 },
  amountStat: { alignItems: 'flex-end' },
  amountValue: { fontSize: 17, fontWeight: '700' },
  amountLabel: { fontSize: 11, opacity: 0.5, lineHeight: 14 },
  shareCard: { gap: 12 },
  shareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  shareLabel: { fontSize: 14, fontWeight: '600' },
  shareSub: { fontSize: 12, opacity: 0.5, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', rowGap: 6, columnGap: 6, flexShrink: 1 },
  chip: { minWidth: 36, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center' },
  chipOff: { opacity: 0.35 },
  chipText: { fontSize: 13, fontWeight: '600' },
  monthsInput: {
    minWidth: 52,
    marginLeft: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  chipTextOn: { color: '#fff' },
  shareButtons: { flexDirection: 'row', gap: 10 },
  shareButton: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  shareButtonText: { fontSize: 14, fontWeight: '600' },
});
