import { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useSegments } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/auth-context';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, formatDate } from '@/hooks/use-habit-records';
import { useTodayDate } from '@/hooks/use-today-date';
import { isRecordCompleted } from '@/lib/habit-scoring';
import { useTour, type Rect } from '@/contexts/tour-context';
import { getSeen, setSeen } from '@/lib/tutorial-flags';

/** Shade ladder shown in the card: the same opacity ramp the heatmap uses. */
const SAMPLE_RATIOS = [0, 0.25, 0.5, 0.75, 1];

/**
 * One-time card explaining the Month-view calendar: what the green shades
 * mean and that a day can be tapped for its breakdown. Root-mounted so it
 * shows on sign-in, once per account (see lib/tutorial-flags), and only
 * once the calendar has something to show: at least MIN_ACTIVE_DAYS days
 * this month with a habit done. That keeps it away from brand-new accounts
 * (they get the Genesis tour) and from the first days of a month, when the
 * calendar would be blank. Marked seen as it opens.
 *
 * Not an RN Modal: it's an in-tree overlay built like the tour spotlight
 * (four dim panes leaving a hole), so while the card is up the day view's
 * Month link stays lit, ringed and tappable. Two ways in: "Show me" jumps
 * to the calendar, or tap Month yourself, the usual way. Either closes the
 * card; so does "Got it".
 */
const RING_PAD = 8;
/** Days this month with at least one habit done before the card is worth showing. */
const MIN_ACTIVE_DAYS = 5;
const DIM = 'rgba(8,6,18,0.7)';

export function CalendarTipsModal() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();
  const { habits, isLoading } = useHabits();
  const { isActive: tourActive, measureTarget } = useTour();
  const { todayDate } = useTodayDate();
  const monthStart = formatDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1));
  const monthEnd = formatDate(new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0));
  const { records, isLoading: recordsLoading } = useHabitRecords(monthStart, monthEnd);
  const habitById = useMemo(() => new Map(habits.map((h) => [h.id, h])), [habits]);
  const activeDays = useMemo(() => {
    const days = new Set<string>();
    for (const r of records) {
      const habit = habitById.get(r.habitId);
      if (habit && isRecordCompleted(habit, r)) days.add(r.date);
    }
    return days.size;
  }, [records, habitById]);
  const segments = useSegments();
  const { width: W, height: H } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!user || isLoading || recordsLoading || tourActive) return;
    if (activeDays < MIN_ACTIVE_DAYS) return;
    let cancelled = false;
    (async () => {
      const seen = await getSeen('calendar-tips', user.uid);
      if (cancelled || seen) return;
      // Marked seen the instant it opens so a background/foreground cycle
      // can't re-pop it.
      await setSeen('calendar-tips', true, user.uid);
      if (!cancelled) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, recordsLoading, tourActive, activeDays]);

  // Ring the Month link when the day view is showing. It mounts with that
  // screen, so poll briefly; elsewhere (notes-as-home) the card shows alone.
  const routeKey = segments.join('/');
  const onDayView = segments[0] === '(tabs)' && segments[1] === '(habits)' && segments.length === 2;
  useEffect(() => {
    if (!visible || !onDayView) return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      const r = await measureTarget('month-link');
      if (cancelled) return;
      if (r) setRect(r);
      else if (++tries < 20) setTimeout(tick, 100);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [visible, onDayView, routeKey, measureTarget]);



  useEffect(() => {
    if (!visible || !rect || !onDayView) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, rect, onDayView, pulse]);

  if (!visible || !user) return null;
  // The measured rect only applies while the day view is showing.
  const target = onDayView ? rect : null;

  const shade = (ratio: number) => {
    if (ratio === 0) return colors.tileUnrecorded;
    const opacity = Math.round(0x30 + (0xff - 0x30) * ratio);
    return `${colors.tileRecorded}${opacity.toString(16).padStart(2, '0').toUpperCase()}`;
  };

  const close = () => setVisible(false);
  const showMe = () => {
    setVisible(false);
    router.push('/(tabs)/(habits)/month');
  };

  // Hole + ring geometry around the Month link.
  const hx = target ? target.x - RING_PAD : 0;
  const hy = target ? target.y - RING_PAD : 0;
  const hw = target ? target.width + RING_PAD * 2 : 0;
  const hh = target ? target.height + RING_PAD * 2 : 0;
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {target ? (
        <>
          {/* Four dim panes frame a clear hole over Month. The hole itself
              is a press target that does what the link does (close + open
              the calendar), so the card can't linger behind the calendar. */}
          <View style={[styles.dim, { left: 0, top: 0, width: W, height: hy }]} />
          <View style={[styles.dim, { left: 0, top: hy + hh, width: W, height: Math.max(0, H - hy - hh) }]} />
          <View style={[styles.dim, { left: 0, top: hy, width: hx, height: hh }]} />
          <View style={[styles.dim, { left: hx + hw, top: hy, width: Math.max(0, W - hx - hw), height: hh }]} />
          <Pressable
            style={{ position: 'absolute', left: hx, top: hy, width: hw, height: hh }}
            onPress={showMe}
            accessibilityRole="button"
            accessibilityLabel="Month"
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              { left: hx, top: hy, width: hw, height: hh, borderRadius: hh / 2, borderColor: colors.tint, transform: [{ scale }] },
            ]}
          />
          <View pointerEvents="none" style={[styles.callout, { top: hy + hh + 8, right: 16, backgroundColor: colors.tint }]}>
            <ThemedText style={styles.calloutText}>Tap to see calendar</ThemedText>
          </View>
        </>
      ) : (
        <View style={[styles.dim, StyleSheet.absoluteFill]} />
      )}

      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.card, { backgroundColor: colors.tileBackground }]}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            The month calendar
          </ThemedText>

          <View style={styles.ladder}>
            {SAMPLE_RATIOS.map((r, i) => (
              <View key={i} style={[styles.swatch, { backgroundColor: shade(r) }]} />
            ))}
          </View>
          <View style={styles.ladderLabels}>
            <ThemedText style={styles.ladderLabel}>nothing</ThemedText>
            <ThemedText style={styles.ladderLabel}>every habit ideal</ThemedText>
          </View>

          <View style={styles.tips}>
            <ThemedText style={styles.tip}>
              Each day is shaded by how much you did. Done counts 1, goal 1.25, ideal 1.5,
              across every habit tracked that day.
            </ThemedText>
            <ThemedText style={styles.tip}>
              Tap a day to see the breakdown: each habit and how far you took it. Tap
              anywhere else to close it, or tap another day to jump there.
            </ThemedText>
            <ThemedText style={styles.tip}>
              Below the calendar, each habit shows its month: how often you did it, a trend
              line, and for habits with amounts like hours or steps, your average, median and
              total.
            </ThemedText>
          </View>

          <Pressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={showMe}
            accessibilityRole="button"
            accessibilityLabel="Show me the calendar"
          >
            <ThemedText style={styles.buttonText}>Show me</ThemedText>
          </Pressable>
          <Pressable
            style={styles.closeButton}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <ThemedText style={[styles.closeButtonText, { color: colors.text }]}>Got it</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  // Centered: the card is the point. The ringed Month link lives in the
  // header, well above it.
  center: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 18,
    textAlign: 'center',
  },
  ladder: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 4,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  ladderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  ladderLabel: {
    fontSize: 11,
    opacity: 0.55,
  },
  tips: {
    gap: 10,
    marginTop: 4,
  },
  tip: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.85,
  },
  button: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  closeButton: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  closeButtonText: {
    fontSize: 14,
    opacity: 0.6,
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  callout: {
    position: 'absolute',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  calloutText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
