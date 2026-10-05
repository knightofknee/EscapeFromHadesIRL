import { useMemo, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { addDays, parseDate } from '@/lib/date-utils';
import { choreStatus, formatDue, formatFrequency, formatShortDate, formatSince, isTask } from '@/lib/chores';
import { CHORE_STATE_COLORS, choreInkColor } from './chore-colors';
import type { Chore } from '@/types/chore';

/** Days offered as tappable chips for logging (today and back). */
const CHIP_DAYS = 60;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Props = {
  chore: Chore | null;
  today: string;
  onClose: () => void;
  /** Toggle a day: logs it when absent, removes it when present. */
  onToggleDate: (date: string, done: boolean) => void;
  onEdit: () => void;
};

function shortDate(date: string): string {
  return parseDate(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Detail sheet for one chore: a strip of recent days to log when it was
 * done (default today, any of the last 60 days) and tap again to remove,
 * so logging and undoing live on the same control. A one-time task shows its
 * details and one done / not done toggle instead.
 */
export function ChoreSheet({ chore, today, onClose, onToggleDate, onEdit }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  // Oldest on the left, today on the right (calendar reading order); the
  // strip opens scrolled to the end so today is in view.
  const days = useMemo(
    () => Array.from({ length: CHIP_DAYS }, (_, i) => addDays(today, i - (CHIP_DAYS - 1))),
    [today],
  );
  const stripRef = useRef<ScrollView>(null);
  const doneSet = useMemo(() => new Set(chore?.completions ?? []), [chore]);
  const oldest = days[0];
  const older = (chore?.completions ?? []).filter((d) => d < oldest);

  if (!chore) return null;
  const status = choreStatus(chore, today);
  const stateColor = CHORE_STATE_COLORS[status.state];
  const task = isTask(chore);
  const doneOn = chore.completions[0];
  const details = chore.description?.trim();

  function toggle(date: string) {
    Haptics.selectionAsync().catch(() => {});
    onToggleDate(date, doneSet.has(date));
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.tileBackground, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.tileBorder }]} />
        <View style={styles.titleRow}>
          {!!chore.emoji && <ThemedText style={styles.emoji}>{chore.emoji}</ThemedText>}
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.title} numberOfLines={2}>
              {chore.name}
            </ThemedText>
            <ThemedText style={styles.sub}>
              {task
                ? `One time · Due ${chore.dueDate ? formatShortDate(chore.dueDate, today) : 'anytime'}`
                : `${formatFrequency(chore.frequencyDays)} · Last: ${
                    status.daysSince == null ? 'never' : formatSince(status.daysSince).toLowerCase()
                  }`}
            </ThemedText>
          </View>
          <View style={[styles.pill, { backgroundColor: `${stateColor}26` }]}>
            <ThemedText style={[styles.pillText, { color: choreInkColor(status.state, scheme) }]}>
              {formatDue(status)}
            </ThemedText>
          </View>
        </View>

        {task ? (
          <>
            {!!details && <ThemedText style={styles.details}>{details}</ThemedText>}
            <Pressable
              onPress={() => toggle(doneOn ?? today)}
              accessibilityRole="button"
              style={[
                styles.taskToggle,
                doneOn
                  ? { borderColor: colors.tileBorder }
                  : { borderColor: CHORE_STATE_COLORS.fresh, backgroundColor: CHORE_STATE_COLORS.fresh },
              ]}
            >
              <ThemedText style={[styles.taskToggleText, !doneOn && styles.chipTextDone]}>
                {doneOn ? 'Mark not done' : '✓ Mark done'}
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <>
            <ThemedText style={styles.label}>When was it done?</ThemedText>
            <ThemedText style={styles.hint}>Tap a day to log it. Tap again to remove it.</ThemedText>
            <ScrollView
              ref={stripRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              onContentSizeChange={() => stripRef.current?.scrollToEnd({ animated: false })}
            >
              {days.map((date, i) => {
                const done = doneSet.has(date);
                const d = parseDate(date);
                const back = CHIP_DAYS - 1 - i;
                const top = back === 0 ? 'Today' : back === 1 ? 'Yest.' : WEEKDAYS[d.getDay()];
                return (
                  <Pressable
                    key={date}
                    onPress={() => toggle(date)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: done }}
                    accessibilityLabel={`${shortDate(date)}${done ? ', done' : ''}`}
                    style={[
                      styles.chip,
                      { borderColor: done ? CHORE_STATE_COLORS.fresh : colors.tileBorder },
                      done && { backgroundColor: CHORE_STATE_COLORS.fresh },
                    ]}
                  >
                    <ThemedText style={[styles.chipTop, done && styles.chipTextDone]}>{top}</ThemedText>
                    <ThemedText style={[styles.chipDay, done && styles.chipTextDone]}>{d.getDate()}</ThemedText>
                    <ThemedText style={[styles.chipTop, done && styles.chipTextDone]}>
                      {done ? '✓' : d.toLocaleDateString(undefined, { month: 'short' })}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>

            {older.length > 0 && (
              <View style={styles.olderRow}>
                <ThemedText style={styles.hint}>Earlier:</ThemedText>
                {older.map((date) => (
                  <Pressable
                    key={date}
                    onPress={() => toggle(date)}
                    style={[styles.olderChip, { borderColor: colors.tileBorder }]}
                    accessibilityLabel={`Remove ${shortDate(date)}`}
                  >
                    <ThemedText style={styles.olderText}>{shortDate(date)} ✕</ThemedText>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        <View style={styles.actions}>
          <Pressable
            style={[styles.secondary, { borderColor: colors.tileBorder }]}
            onPress={onEdit}
            accessibilityRole="button"
          >
            <ThemedText style={styles.secondaryText}>{task ? 'Edit task' : 'Edit chore'}</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.secondary, { borderColor: colors.tileBorder }]}
            onPress={onClose}
            accessibilityRole="button"
          >
            <ThemedText style={styles.secondaryText}>Close</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 36, lineHeight: 44 },
  title: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  sub: { fontSize: 13, opacity: 0.6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  label: { fontSize: 15, fontWeight: '600', marginTop: 20 },
  details: { fontSize: 15, lineHeight: 21, marginTop: 16, opacity: 0.85 },
  taskToggle: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  taskToggleText: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, opacity: 0.55 },
  chips: { gap: 8, paddingVertical: 12 },
  chip: {
    width: 52,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  chipTop: { fontSize: 11, opacity: 0.7, lineHeight: 14 },
  chipDay: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  chipTextDone: { color: '#fff', opacity: 1 },
  olderRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  olderChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  olderText: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '600' },
});
