import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDate, parseDate, weekdayOrder, WEEKDAY_SHORT } from '@/lib/date-utils';
import { useWeekStart } from '@/hooks/use-week-start';

type Props = {
  /** Selected date, YYYY-MM-DD. */
  value: string;
  today: string;
  onChange: (date: string) => void;
  /** Earliest / latest pickable day (YYYY-MM-DD, inclusive). Days outside are dimmed and not tappable. */
  min?: string;
  max?: string;
};

/** First of the month, as a local Date. */
function monthStart(date: string): Date {
  const d = parseDate(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Month calendar for picking one date. Opens on the selected date's month and
 * follows it when the value changes from outside (a preset chip). Past days
 * are dimmed but still pickable.
 */
export function DateCalendar({ value, today, onChange, min, max }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { weekStartsOn } = useWeekStart();
  const [month, setMonth] = useState(() => monthStart(value));
  // Jump to the new value's month when it changes from outside.
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    setMonth(monthStart(value));
  }

  const year = month.getFullYear();
  const m = month.getMonth();
  const lead = (month.getDay() - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => formatDate(new Date(year, m, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);

  const title = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <View style={[styles.card, { borderColor: colors.tileBorder }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setMonth(new Date(year, m - 1, 1))}
          hitSlop={8}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <ThemedText style={[styles.navText, { color: colors.tint }]}>‹</ThemedText>
        </Pressable>
        <ThemedText style={styles.title}>{title}</ThemedText>
        <Pressable
          onPress={() => setMonth(new Date(year, m + 1, 1))}
          hitSlop={8}
          style={styles.navButton}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <ThemedText style={[styles.navText, { color: colors.tint }]}>›</ThemedText>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {weekdayOrder(weekStartsOn).map((d) => (
          <View key={`w${d}`} style={styles.cell}>
            <ThemedText style={styles.weekday}>{WEEKDAY_SHORT[d][0]}</ThemedText>
          </View>
        ))}
        {cells.map((date, i) => {
          if (!date) return <View key={`e${i}`} style={styles.cell} />;
          const selected = date === value;
          const isToday = date === today;
          const past = date < today;
          const outOfRange = (min !== undefined && date < min) || (max !== undefined && date > max);
          return (
            <View key={date} style={styles.cell}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onChange(date);
                }}
                disabled={outOfRange}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: outOfRange }}
                accessibilityLabel={parseDate(date).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
                style={[
                  styles.day,
                  selected && { backgroundColor: colors.tint },
                  !selected && isToday && { borderWidth: 1.5, borderColor: colors.tint },
                ]}
              >
                <ThemedText
                  style={[
                    styles.dayText,
                    past && !selected && styles.past,
                    outOfRange && styles.outOfRange,
                    selected && styles.selectedText,
                    !selected && isToday && { color: colors.tint, fontWeight: '700' },
                  ]}
                >
                  {parseDate(date).getDate()}
                </ThemedText>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const DAY = 38;

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  navButton: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 26, lineHeight: 30, fontWeight: '600' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: DAY + 4, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 12, fontWeight: '600', opacity: 0.5 },
  day: { width: DAY, height: DAY, borderRadius: DAY / 2, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15, lineHeight: 20 },
  past: { opacity: 0.35 },
  outOfRange: { opacity: 0.15 },
  selectedText: { color: '#fff', fontWeight: '700' },
});
