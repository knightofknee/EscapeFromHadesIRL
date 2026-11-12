import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { DateCalendar } from '@/components/chores/date-calendar';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTodayDate } from '@/hooks/use-today-date';
import { parseDate } from '@/lib/date-utils';
import { buildDateRange } from '@/lib/vacation-days';

type VacationRangeModalProps = {
  visible: boolean;
  /** Default both pickers to this date when the modal opens. Falls back
      to today if omitted. */
  defaultDate?: string;
  onCancel: () => void;
  onConfirm: (startDate: string, endDate: string) => void | Promise<void>;
};

type Side = 'start' | 'end';

function formatPretty(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Start / End chip. The active one is the side the calendar below edits;
 * tapping switches which side the next calendar tap sets.
 */
function SideChip({
  label,
  date,
  active,
  onPress,
  accentColor,
  borderColor,
  textColor,
}: {
  label: string;
  date: string;
  active: boolean;
  onPress: () => void;
  accentColor: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <Pressable
      style={[
        chipStyles.chip,
        {
          borderColor: active ? accentColor : borderColor,
          backgroundColor: active ? `${accentColor}20` : 'transparent',
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}: ${formatPretty(date)}`}
    >
      <ThemedText style={[chipStyles.label, active && { color: accentColor, opacity: 1 }]}>
        {label}
      </ThemedText>
      <ThemedText style={[chipStyles.date, { color: textColor }]} numberOfLines={1}>
        {formatPretty(date)}
      </ThemedText>
    </Pressable>
  );
}

export function VacationRangeModal({
  visible,
  defaultDate,
  onCancel,
  onConfirm,
}: VacationRangeModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const blue = colors.vacationButton;
  const { todayStr } = useTodayDate();
  const initialDate = defaultDate ?? todayStr;

  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [editing, setEditing] = useState<Side>('start');
  const [submitting, setSubmitting] = useState(false);

  // Reset to the caller's chosen default every time the modal opens.
  useEffect(() => {
    if (visible) {
      setStartDate(initialDate);
      setEndDate(initialDate);
      setEditing('start');
      setSubmitting(false);
    }
  }, [visible, initialDate]);

  // Maintain `start ≤ end` by clamping the other side: picking a start
  // past the end moves the end up to it, and picking an end before the
  // start moves the start back to it. The hint under the calendar says so.
  // Picking the start hands the calendar to the end side, so a range is
  // two taps; picking the end stays on end for fine adjustment.
  const handlePick = useCallback(
    (date: string) => {
      if (editing === 'start') {
        setStartDate(date);
        setEndDate((prev) => (date > prev ? date : prev));
        setEditing('end');
      } else {
        setEndDate(date);
        setStartDate((prev) => (date < prev ? date : prev));
      }
    },
    [editing],
  );

  const dayCount = useMemo(() => {
    return buildDateRange(startDate, endDate).length;
  }, [startDate, endDate]);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(startDate, endDate);
    } catch (err) {
      // Surface failures (rules denial, network) instead of swallowing
      // them silently. The modal stays open so the user can retry.
      console.error('Failed to create vacation days:', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      {/* Tap-outside-to-dismiss: outer Pressable handles backdrop taps,
          inner Pressable stops propagation so taps inside the sheet
          don't close it. */}
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable
          style={[styles.content, { backgroundColor: colors.tileBackground }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Set Vacation Days
          </ThemedText>

          <View style={styles.sides}>
            <SideChip
              label="Start"
              date={startDate}
              active={editing === 'start'}
              onPress={() => setEditing('start')}
              accentColor={blue}
              borderColor={colors.tileBorder}
              textColor={colors.text}
            />
            <SideChip
              label="End"
              date={endDate}
              active={editing === 'end'}
              onPress={() => setEditing('end')}
              accentColor={blue}
              borderColor={colors.tileBorder}
              textColor={colors.text}
            />
          </View>

          {/* One calendar edits whichever side is active. It follows the
              active side's month, so switching sides jumps to that date. */}
          <View style={styles.calendar}>
            <DateCalendar
              value={editing === 'start' ? startDate : endDate}
              today={todayStr}
              onChange={handlePick}
            />
          </View>

          <View style={styles.previewWrap}>
            <ThemedText style={styles.preview}>
              {dayCount === 1
                ? '1 day will be marked as vacation'
                : `${dayCount} days will be marked as vacation`}
            </ThemedText>
            <ThemedText style={styles.hint}>
              End cannot come before start. The other date moves to match.
            </ThemedText>
          </View>

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              disabled={submitting}
            >
              <ThemedText>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: blue, opacity: submitting ? 0.6 : 1 }]}
              onPress={handleConfirm}
              disabled={submitting}
            >
              <ThemedText style={styles.confirmText}>
                {submitting ? 'Saving…' : 'Confirm'}
              </ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
  },
  sides: {
    flexDirection: 'row',
    gap: 8,
  },
  // DateCalendar carries its own marginTop: 12; the modal's gap already
  // spaces it, so pull that back.
  calendar: {
    marginTop: -12,
  },
  previewWrap: {
    gap: 4,
  },
  preview: {
    textAlign: 'center',
    fontSize: 13,
    opacity: 0.75,
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    opacity: 0.5,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '600',
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  label: {
    fontSize: 11,
    opacity: 0.7,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  date: {
    fontSize: 14,
    fontWeight: '500',
  },
});
