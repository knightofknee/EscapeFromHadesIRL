import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The stored value is month and day only ("MM-DD"). The picker needs a
 *  full date, so it is shown in a leap year to keep Feb 29 pickable; the
 *  year is dropped on save. */
const PICKER_YEAR = 2024;

/** "10-16" → "Oct 16". */
export function formatBirthday(mmdd: string): string {
  const [m, d] = mmdd.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

function toPickerDate(mmdd: string | null): Date {
  const [m, d] = (mmdd ?? '01-01').split('-').map(Number);
  return new Date(PICKER_YEAR, m - 1, d);
}

function toMmdd(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Month and day only (no year). Native date picker: an inline spinner on
 * iOS, the system dialog on Android. Save stores it; Clear removes it.
 */
export function BirthdayModal({
  visible,
  value,
  onSave,
  onClose,
}: {
  visible: boolean;
  value: string | null;
  onSave: (mmdd: string | null) => void;
  onClose: () => void;
}) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [date, setDate] = useState(() => toPickerDate(value));

  useEffect(() => {
    if (!visible) return;
    setDate(toPickerDate(value));
  }, [visible, value]);

  const mmdd = toMmdd(date);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ThemedText style={styles.title}>Birthday</ThemedText>
          <ThemedText style={styles.subtitle}>
            The day before through 6 days after is win-only for 60-day quests.
            Month and day only. The year is not saved.
          </ThemedText>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              themeVariant={scheme}
              accentColor={colors.tint}
              textColor={colors.text}
              style={styles.spinner}
              onChange={(_e, next) => next && setDate(next)}
            />
          ) : (
            <Pressable
              onPress={() =>
                DateTimePickerAndroid.open({
                  value: date,
                  mode: 'date',
                  onChange: (event, next) => {
                    if (event.type === 'set' && next) setDate(next);
                  },
                })
              }
              style={[styles.dateButton, { borderColor: colors.tint }]}
              accessibilityRole="button"
              accessibilityLabel={`Birthday ${formatBirthday(mmdd)}`}
            >
              <ThemedText style={styles.dateButtonText}>{formatBirthday(mmdd)}</ThemedText>
            </Pressable>
          )}
          <View style={styles.buttons}>
            {value && (
              <Pressable
                onPress={() => {
                  onSave(null);
                  onClose();
                }}
                style={styles.clear}
                accessibilityRole="button"
              >
                <ThemedText style={[styles.clearText, { color: colors.tint }]}>Clear</ThemedText>
              </Pressable>
            )}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
              <ThemedText style={styles.cancelText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                onSave(mmdd);
                onClose();
              }}
              style={[styles.save, { backgroundColor: colors.tint }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.saveText}>Save</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 14,
  },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 13, opacity: 0.6, marginTop: -8 },
  spinner: { alignSelf: 'stretch' },
  dateButton: {
    alignSelf: 'center',
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  dateButtonText: { fontSize: 17, fontWeight: '600' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  clear: { paddingVertical: 9, paddingHorizontal: 4 },
  clearText: { fontSize: 15, fontWeight: '600' },
  cancel: { paddingVertical: 9, paddingHorizontal: 12 },
  cancelText: { fontSize: 15, opacity: 0.7 },
  save: { paddingVertical: 9, paddingHorizontal: 20, borderRadius: 10 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
