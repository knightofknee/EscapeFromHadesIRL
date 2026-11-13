import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Habit } from '@/types/habit';

type Props = {
  habits: Habit[];
  /** The habit shown on the calendar, or null for all of them. */
  focusId: string | null;
  onPick: (habitId: string | null) => void;
};

/**
 * One button under the Month calendar: "All habits" or the habit on show.
 * Tap it for the list, pick one, and the calendar shows that habit alone.
 * Styled like the month picker.
 */
export function HabitFocusPicker({ habits, focusId, onPick }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [open, setOpen] = useState(false);
  const focus = focusId ? (habits.find((h) => h.id === focusId) ?? null) : null;
  const options: (Habit | null)[] = [null, ...habits];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.button, { borderColor: focus?.color ?? colors.tileBorder }]}
        accessibilityRole="button"
        accessibilityLabel={`Showing ${focus ? focus.name : 'all habits'}. Choose a habit`}
      >
        {focus && (
          <ThemedText style={[styles.abbr, { color: focus.color }]}>{focus.icon ?? focus.abbreviation}</ThemedText>
        )}
        <ThemedText style={styles.buttonText} numberOfLines={1}>
          {focus ? focus.name : 'All habits'}
        </ThemedText>
        <ThemedText style={[styles.caret, { color: colors.icon }]}>▾</ThemedText>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.tileBackground }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ThemedText type="defaultSemiBold" style={styles.title}>
              Show on the calendar
            </ThemedText>
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {options.map((h) => {
                const on = (h?.id ?? null) === focusId;
                return (
                  <Pressable
                    key={h?.id ?? 'all'}
                    onPress={() => {
                      onPick(h?.id ?? null);
                      setOpen(false);
                    }}
                    style={[styles.row, { borderColor: colors.tileBorder }, on && { backgroundColor: colors.tint }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    {h && (
                      <ThemedText style={[styles.abbr, { color: on ? '#fff' : h.color }]}>
                        {h.icon ?? h.abbreviation}
                      </ThemedText>
                    )}
                    <ThemedText style={[styles.rowText, on && styles.rowTextOn]} numberOfLines={1}>
                      {h ? h.name : 'All habits'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.footer}>
              <Pressable onPress={() => setOpen(false)} style={styles.cancel} accessibilityRole="button">
                <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  buttonText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  caret: { fontSize: 13 },
  abbr: { fontSize: 14, fontWeight: '800' },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  title: { textAlign: 'center', fontSize: 16 },
  list: { flexGrow: 0 },
  listContent: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  rowTextOn: { color: '#fff' },
  footer: { alignItems: 'center' },
  cancel: { paddingVertical: 6, paddingHorizontal: 16 },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
