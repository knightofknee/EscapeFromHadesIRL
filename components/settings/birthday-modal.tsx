import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
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
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "10-16" → "Oct 16". */
export function formatBirthday(mmdd: string): string {
  const [m, d] = mmdd.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

/**
 * Month and day only (no year). Arrow steppers, wrapping around, the day
 * clamped to the month. Save stores it; Clear removes it.
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
  const [month, setMonth] = useState(1);
  const [day, setDay] = useState(1);

  useEffect(() => {
    if (!visible) return;
    const [m, d] = (value ?? '01-01').split('-').map(Number);
    setMonth(m);
    setDay(d);
  }, [visible, value]);

  const stepMonth = (dir: -1 | 1) => {
    const next = ((month - 1 + dir + 12) % 12) + 1;
    setMonth(next);
    setDay((d) => Math.min(d, DAYS_IN[next - 1]));
  };
  const stepDay = (dir: -1 | 1) => {
    const max = DAYS_IN[month - 1];
    setDay((d) => ((d - 1 + dir + max) % max) + 1);
  };

  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

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
          </ThemedText>
          <Stepper label={MONTHS[month - 1]} onStep={stepMonth} tint={colors.tint} name="month" />
          <Stepper label={String(day)} onStep={stepDay} tint={colors.tint} name="day" />
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

function Stepper({
  label,
  onStep,
  tint,
  name,
}: {
  label: string;
  onStep: (dir: -1 | 1) => void;
  tint: string;
  name: string;
}) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onStep(-1)}
        style={[styles.arrow, { borderColor: tint }]}
        hitSlop={6}
        accessibilityLabel={`Previous ${name}`}
      >
        <ThemedText style={[styles.arrowText, { color: tint }]}>‹</ThemedText>
      </Pressable>
      <ThemedText style={styles.stepValue}>{label}</ThemedText>
      <Pressable
        onPress={() => onStep(1)}
        style={[styles.arrow, { borderColor: tint }]}
        hitSlop={6}
        accessibilityLabel={`Next ${name}`}
      >
        <ThemedText style={[styles.arrowText, { color: tint }]}>›</ThemedText>
      </Pressable>
    </View>
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
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { fontSize: 22, fontWeight: '600', lineHeight: 22 },
  stepValue: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  clear: { paddingVertical: 9, paddingHorizontal: 4 },
  clearText: { fontSize: 15, fontWeight: '600' },
  cancel: { paddingVertical: 9, paddingHorizontal: 12 },
  cancelText: { fontSize: 15, opacity: 0.7 },
  save: { paddingVertical: 9, paddingHorizontal: 20, borderRadius: 10 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
