import { Modal, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type VacationMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSelectVacation: () => void;
};

/**
 * Bottom-anchored popover menu for the ⋯ button between Add Habit /
 * Add Note. Currently has one item — "Set Vacation Days" — plus a
 * short paragraph explaining what vacation days do. The menu is
 * future-proofed to grow more items later.
 */
export function VacationMenu({ visible, onClose, onSelectVacation }: VacationMenuProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const blue = colors.vacationButton;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* stopPropagation: tapping inside the sheet should NOT close it */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.tileBackground }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ThemedText type="defaultSemiBold" style={styles.title}>
            More
          </ThemedText>

          <Pressable
            style={[styles.item, { borderColor: blue, backgroundColor: `${blue}15` }]}
            onPress={() => {
              onClose();
              onSelectVacation();
            }}
          >
            <ThemedText style={[styles.itemLabel, { color: blue }]}>
              Set Vacation Days
            </ThemedText>
          </Pressable>

          <ThemedText style={styles.instructions}>
            Vacation days take a break from tracking. They don&apos;t break streaks
            and aren&apos;t counted in averages — your stats roll right past them.
            Long-press a vacation day to change its label or color.
          </ThemedText>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    marginHorizontal: 12,
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 14,
    opacity: 0.7,
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  instructions: {
    fontSize: 13,
    opacity: 0.7,
    lineHeight: 18,
  },
});
