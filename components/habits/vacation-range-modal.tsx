import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTodayDate } from '@/hooks/use-today-date';
import { addDays, parseDate } from '@/lib/date-utils';
import { buildDateRange } from '@/lib/vacation-days';

type VacationRangeModalProps = {
  visible: boolean;
  /** Default both pickers to this date when the modal opens. Falls back
      to today if omitted. */
  defaultDate?: string;
  onCancel: () => void;
  onConfirm: (startDate: string, endDate: string) => void | Promise<void>;
};

function formatPretty(dateStr: string): string {
  return parseDate(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Arrow-stepped date selector. ‹ / › step the date by ±1 day.
 * No min/max — vacation can be in the past or future.
 */
function DateStepper({
  label,
  date,
  onChange,
  accentColor,
  textColor,
}: {
  label: string;
  date: string;
  onChange: (next: string) => void;
  accentColor: string;
  textColor: string;
}) {
  return (
    <View style={stepperStyles.wrap}>
      <ThemedText style={stepperStyles.label}>{label}</ThemedText>
      <View style={stepperStyles.row}>
        <Pressable
          style={[stepperStyles.arrow, { borderColor: accentColor }]}
          onPress={() => onChange(addDays(date, -1))}
          hitSlop={8}
          accessibilityLabel={`${label}: previous day`}
        >
          <ThemedText style={[stepperStyles.arrowText, { color: accentColor }]}>‹</ThemedText>
        </Pressable>
        <View style={stepperStyles.dateWrap}>
          <ThemedText style={[stepperStyles.dateText, { color: textColor }]}>
            {formatPretty(date)}
          </ThemedText>
        </View>
        <Pressable
          style={[stepperStyles.arrow, { borderColor: accentColor }]}
          onPress={() => onChange(addDays(date, 1))}
          hitSlop={8}
          accessibilityLabel={`${label}: next day`}
        >
          <ThemedText style={[stepperStyles.arrowText, { color: accentColor }]}>›</ThemedText>
        </Pressable>
      </View>
    </View>
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
  const [submitting, setSubmitting] = useState(false);

  // Reset to the caller's chosen default every time the modal opens.
  useEffect(() => {
    if (visible) {
      setStartDate(initialDate);
      setEndDate(initialDate);
      setSubmitting(false);
    }
  }, [visible, initialDate]);

  // Maintain `start ≤ end` invariant by *dragging the other side along*
  // when the edited side would cross over. So clicking "next" on start
  // when start === end advances BOTH (one-day range stays one day at the
  // new date) — it doesn't silently move the end stepper instead.
  const handleStartChange = useCallback((next: string) => {
    setStartDate(next);
    setEndDate((prev) => (next > prev ? next : prev));
  }, []);

  const handleEndChange = useCallback((next: string) => {
    setEndDate(next);
    setStartDate((prev) => (next < prev ? next : prev));
  }, []);

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

          <DateStepper
            label="Start"
            date={startDate}
            onChange={handleStartChange}
            accentColor={blue}
            textColor={colors.text}
          />

          <DateStepper
            label="End"
            date={endDate}
            onChange={handleEndChange}
            accentColor={blue}
            textColor={colors.text}
          />

          <ThemedText style={styles.preview}>
            {dayCount === 1
              ? '1 day will be marked as vacation'
              : `${dayCount} days will be marked as vacation`}
          </ThemedText>

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
    gap: 16,
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
  },
  preview: {
    textAlign: 'center',
    fontSize: 13,
    opacity: 0.75,
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

const stepperStyles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    opacity: 0.7,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 22,
  },
  dateWrap: {
    flex: 1,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
