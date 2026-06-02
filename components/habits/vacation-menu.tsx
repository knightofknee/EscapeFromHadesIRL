import { Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWinOnlyWeekends } from '@/hooks/use-win-only-weekends';

type VacationMenuProps = {
  visible: boolean;
  onClose: () => void;
  onSelectVacation: () => void;
  /** Whether the currently-viewed day is already a vacation day. */
  isVacationDay: boolean;
  /** Size of the contiguous vacation block the viewed day belongs to. */
  blockSize: number;
  /** Un-vacation just the viewed day. */
  onRemoveDay: () => void;
  /** Un-vacation the whole contiguous block. */
  onRemoveBlock: () => void;
};

/**
 * Bottom-anchored popover menu opened by the ⋯ button between Add Habit
 * and Add Note. Surfaces non-tracking settings — vacation days and the
 * weekend-leniency toggle. New entries should be section-style: button
 * (or row), then the short paragraph that explains what it does.
 *
 * On a vacation day the top "Set Vacation Days" entry is replaced by a
 * remove option so users can undo from the same place they set it: a
 * single "Remove Vacation Day" for a standalone day, or this-day vs
 * whole-block choices when the day is part of a multi-day vacation.
 */
export function VacationMenu({
  visible,
  onClose,
  onSelectVacation,
  isVacationDay,
  blockSize,
  onRemoveDay,
  onRemoveBlock,
}: VacationMenuProps) {
  'use no memo';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const blue = colors.vacationButton;
  const red = colors.tint;
  const { winOnlyWeekends, setWinOnlyWeekends } = useWinOnlyWeekends();
  const hasBlock = blockSize > 1;

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
          {isVacationDay ? (
            <>
              <Pressable
                style={[styles.item, { borderColor: red, backgroundColor: `${red}15` }]}
                onPress={() => {
                  onClose();
                  onRemoveDay();
                }}
              >
                <ThemedText style={[styles.itemLabel, { color: red }]}>
                  {hasBlock ? 'Remove This Day Only' : 'Remove Vacation Day'}
                </ThemedText>
              </Pressable>

              {hasBlock && (
                <Pressable
                  style={[styles.item, { borderColor: red, backgroundColor: `${red}15` }]}
                  onPress={() => {
                    onClose();
                    onRemoveBlock();
                  }}
                >
                  <ThemedText style={[styles.itemLabel, { color: red }]}>
                    Remove All {blockSize} Vacation Days
                  </ThemedText>
                </Pressable>
              )}

              <ThemedText style={styles.instructions}>
                Removing brings the day back to normal tracking — its habit
                records resurface and count toward streaks and averages again.
                Long-press a vacation day to change its label or color.
              </ThemedText>
            </>
          ) : (
            <>
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
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.toggleRow}>
            <ThemedText style={styles.toggleLabel}>Only wins Weekends</ThemedText>
            <Switch
              value={winOnlyWeekends}
              onValueChange={setWinOnlyWeekends}
              trackColor={{ false: colors.tileBorder, true: blue }}
              thumbColor="#fff"
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
