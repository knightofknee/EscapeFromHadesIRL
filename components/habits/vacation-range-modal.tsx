import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTodayDate } from '@/hooks/use-today-date';
import { addDays, parseDate } from '@/lib/date-utils';
import { buildDateRange } from '@/lib/vacation-days';

type VacationRangeModalProps = {
  visible: boolean;
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
  onCancel,
  onConfirm,
}: VacationRangeModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const blue = colors.vacationButton;
  const { todayStr } = useTodayDate();

  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [submitting, setSubmitting] = useState(false);

  // Reset to today every time the modal opens.
  useEffect(() => {
    if (visible) {
      setStartDate(todayStr);
      setEndDate(todayStr);
      setSubmitting(false);
    }
  }, [visible, todayStr]);

  // Auto-swap so internal state is always start ≤ end. We display the
  // *post-swap* values back to the user, which makes the UI feel like
  // the dates "snap into order" silently.
  const [orderedStart, orderedEnd] = useMemo(() => {
    return startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  }, [startDate, endDate]);

  const dayCount = useMemo(() => {
    return buildDateRange(orderedStart, orderedEnd).length;
  }, [orderedStart, orderedEnd]);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(orderedStart, orderedEnd);
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
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.tileBackground }]}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Set Vacation Days
          </ThemedText>

          <DateStepper
            label="Start"
            date={orderedStart}
            onChange={(next) => {
              // If user is editing what's currently the "start" position,
              // keep its identity (orderedStart === startDate) by writing
              // back to whichever state holds the smaller date.
              if (startDate <= endDate) setStartDate(next);
              else setEndDate(next);
            }}
            accentColor={blue}
            textColor={colors.text}
          />

          <DateStepper
            label="End"
            date={orderedEnd}
            onChange={(next) => {
              if (startDate <= endDate) setEndDate(next);
              else setStartDate(next);
            }}
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
        </View>
      </View>
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
