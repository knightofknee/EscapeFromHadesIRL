import { useState, useMemo, useRef, useCallback } from 'react';
import { StyleSheet, ScrollView, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { ThemedView } from '@/components/themed-view';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, formatDate } from '@/hooks/use-habit-records';
import { useTodayDate } from '@/hooks/use-today-date';
import { useVacationDays } from '@/hooks/use-vacation-days';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';
import { shouldSkipWeekend } from '@/lib/habit-scoring';
import { computeDayBreakdown } from '@/lib/day-breakdown';
import { DayBreakdownPopover, type PopoverAnchor } from '@/components/habits/day-breakdown-popover';
import { formatStatValue } from '@/lib/habit-stats';
import {
  computeMonthHabitStats,
  formatMinutes,
  formatSteps,
  type MonthAmount,
  type MonthDayInput,
} from '@/lib/month-habit-stats';
import { MonthSparkline } from '@/components/habits/month-sparkline';
import { readableTextOn } from '@/lib/contrast';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { HabitRecord } from '@/types/habit';


const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function MonthViewScreen() {
  const { habits, isLoading: habitsLoading, isOffline, hasLoaded } = useHabits();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [monthOffset, setMonthOffset] = useState(0);
  const { days: vacationDays, dateSet: vacationSet, isLoading: vacationLoading } = useVacationDays();
  const { winOnlyWeekends } = useWinOnlyWeekends();

  // todayDate keeps "this month" / "yesterday" live across midnight and
  // foreground returns — a bare new Date() here would freeze at mount.
  const { todayDate } = useTodayDate();

  const { year, month, daysInMonth, startDate, endDate, monthLabel } = useMemo(() => {
    const now = todayDate;
    const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const y = target.getFullYear();
    const m = target.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    return {
      year: y,
      month: m,
      daysInMonth: dim,
      startDate: formatDate(new Date(y, m, 1)),
      endDate: formatDate(new Date(y, m, dim)),
      monthLabel: `${MONTH_NAMES[m]} ${y}`,
    };
  }, [monthOffset, todayDate]);

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
  const calendarWeeks = useMemo(() => {
    const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // Monday=0
    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = new Array(firstDayOfWeek).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      currentWeek.push(d);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }
    return weeks;
  }, [year, month, daysInMonth]);

  // For current month, only count up to yesterday (today still in progress).
  // On the 1st this is 0 — no countable days yet, rendered as "—" rather
  // than a false 0%.
  const countDays = useMemo(() => {
    const now = todayDate;
    if (year === now.getFullYear() && month === now.getMonth()) {
      return now.getDate() - 1;
    }
    return daysInMonth;
  }, [year, month, daysInMonth, todayDate]);

  // Per-habit month stats (lib/month-habit-stats): completion rate, the
  // total/average/median trio for amount habits (value, steps, meditation
  // minutes), and the sparkline series. Vacation days and weekend
  // non-completions leave the month entirely; with the per-habit
  // weekend-skip rule each habit can have its own denominator.
  const habitRates = useMemo(() => {
    return habits.map((habit) => {
      const days: MonthDayInput[] = [];
      for (let d = 1; d <= countDays; d++) {
        const dateStr = formatDate(new Date(year, month, d));
        const record = recordIndex.get(`${habit.id}_${dateStr}`);
        const excluded =
          vacationSet.has(dateStr) || shouldSkipWeekend(habit, record, dateStr, winOnlyWeekends);
        days.push({ day: d, record, excluded });
      }
      return { habit, ...computeMonthHabitStats(habit, days) };
    });
  }, [habits, recordIndex, year, month, countDays, vacationSet, winOnlyWeekends]);

  // Heatmap data: each day's weighted habit score (see lib/day-breakdown
  // for the weights). Vacation days are skipped — they render as the
  // vacation tile, not part of the heatmap.
  const breakdownFor = useCallback(
    (day: number) =>
      computeDayBreakdown(
        habits,
        formatDate(new Date(year, month, day)),
        (habit) => recordIndex.get(`${habit.id}_${formatDate(new Date(year, month, day))}`),
        winOnlyWeekends,
      ),
    [habits, recordIndex, year, month, winOnlyWeekends],
  );
  const dayCompletionMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (habits.length === 0) return map;
    for (let d = 1; d <= daysInMonth; d++) {
      if (vacationSet.has(formatDate(new Date(year, month, d)))) continue;
      map[d] = breakdownFor(d).ratio;
    }
    return map;
  }, [habits.length, breakdownFor, year, month, daysInMonth, vacationSet]);

  // Tap a day to see what's behind its shade. The cell is measured against
  // the screen container so the popover can sit right above it. Any touch
  // on the container closes it (touches still reach the cells, so a tap on
  // another day closes this one AND opens that one).
  const containerRef = useRef<View>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const cellRefs = useRef(new Map<number, View | null>());
  const [popover, setPopover] = useState<{ day: number; anchor: PopoverAnchor } | null>(null);
  // The day whose popover this touch just closed: tapping it again is a
  // toggle, so its press must not reopen it.
  const closedByTouchRef = useRef<number | null>(null);
  const openDay = useCallback((day: number) => {
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
    ? new Date(year, month, popover.day).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : '';

  function heatmapColor(ratio: number): string {
    if (ratio === 0) return colors.tileUnrecorded;
    // Map ratio to hex opacity: 0.01 → 30, 1.0 → FF
    const opacity = Math.round(0x30 + (0xFF - 0x30) * Math.min(ratio, 1));
    return `${colors.tileRecorded}${opacity.toString(16).padStart(2, '0').toUpperCase()}`;
  }

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
          <Pressable onPress={() => setMonthOffset((o) => o - 1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>‹</ThemedText>
          </Pressable>
          <Pressable onPress={() => setMonthOffset(0)}>
            <ThemedText type="defaultSemiBold" style={styles.monthLabel}>{monthLabel}</ThemedText>
          </Pressable>
          <Pressable onPress={() => setMonthOffset((o) => o + 1)} style={styles.navButton}>
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Calendar heatmap */}
          <View style={styles.calendarSection}>
            <View style={styles.weekdayHeaders}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <ThemedText key={i} style={styles.weekdayLabel}>{d}</ThemedText>
              ))}
            </View>
            {calendarWeeks.map((week, wi) => (
              <View key={wi} style={styles.calendarRow}>
                {week.map((day, di) => {
                  if (!day) {
                    return <View key={di} style={styles.calendarCell} />;
                  }
                  const dateStr = formatDate(new Date(year, month, day));
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
                        cellRefs.current.set(day, node);
                      }}
                      onPress={() => openDay(day)}
                      accessibilityRole="button"
                      accessibilityLabel={`${MONTH_NAMES[month]} ${day}, see habit breakdown`}
                      style={[
                        styles.calendarCell,
                        { backgroundColor: heatmapColor(dayCompletionMap[day] ?? 0) },
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
                    <AmountStat label="avg/day" value={formatAmount(amount, amount.average)} />
                    {amount.showMedian && (
                      <AmountStat label="median" value={formatAmount(amount, amount.median)} />
                    )}
                    <AmountStat label="total" value={formatAmount(amount, amount.total)} />
                  </View>
                )}
              </View>
              <MonthSparkline
                id={habit.id}
                color={habit.color}
                series={series}
                yMax={yMax}
                daysInMonth={daysInMonth}
                baselineColor={colors.tileUnrecorded}
              />
            </View>
          ))}
        </ScrollView>
        )}
        <DayBreakdownPopover
          anchor={popover?.anchor ?? null}
          bounds={bounds}
          title={popoverTitle}
          breakdown={popoverBreakdown}
        />
      </View>
      </ThemedView>
    </SafeAreaView>
  );
}

function formatAmount(amount: MonthAmount, n: number | null): string {
  if (n == null) return '—';
  if (amount.kind === 'minutes') return formatMinutes(n);
  if (amount.kind === 'steps') return formatSteps(n);
  return formatStatValue(n);
}

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
});
