import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type MonthPickerOption = { offset: number; label: string };

type Props = {
  visible: boolean;
  /** Every page the Month view can show, newest first. */
  options: MonthPickerOption[];
  current: number;
  onPick: (offset: number) => void;
  onClose: () => void;
};

/**
 * Jump straight to any month the view can show instead of stepping the
 * arrows one month at a time.
 */
export function MonthPickerModal({ visible, options, current, onPick, onClose }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.tileBackground }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Go to
          </ThemedText>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {options.map((o) => {
              const on = o.offset === current;
              return (
                <Pressable
                  key={o.offset}
                  onPress={() => {
                    onPick(o.offset);
                    onClose();
                  }}
                  style={[styles.row, { borderColor: colors.tileBorder }, on && { backgroundColor: colors.tint }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <ThemedText style={[styles.rowText, on && styles.rowTextOn]}>{o.label}</ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
              <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
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
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowText: { fontSize: 15, fontWeight: '600' },
  rowTextOn: { color: '#fff' },
  footer: { alignItems: 'center' },
  cancel: { paddingVertical: 6, paddingHorizontal: 16 },
  cancelText: { fontSize: 15, fontWeight: '600' },
});
