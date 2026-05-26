import { Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';

type VacationMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSelectVacation: () => void;
};

/**
 * Bottom-anchored popover menu opened by the ⋯ button between Add Habit
 * and Add Note. Surfaces non-tracking settings — vacation days and the
 * weekend-leniency toggle. New entries should be section-style: button
 * (or row), then the short paragraph that explains what it does.
 */
export function VacationMenu({ visible, onClose, onSelectVacation }: VacationMenuProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const blue = colors.vacationButton;
  const { winOnlyWeekends, setWinOnlyWeekends } = useWinOnlyWeekends();

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

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <ThemedText style={styles.toggleLabel}>Win only Weekends</ThemedText>
            <Switch
              value={winOnlyWeekends}
              onValueChange={setWinOnlyWeekends}
              trackColor={{ true: blue }}
            />
          </View>

          <ThemedText style={styles.instructions}>
            On Saturdays and Sundays, only habits you complete count toward your
            stats. Anything left unmarked is skipped, like a mini-vacation — so
            you can win on the weekend but never lose.
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(128,128,128,0.3)',
    marginVertical: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
