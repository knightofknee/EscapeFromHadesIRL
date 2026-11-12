import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { TileGrid } from "@/components/habits/tile-grid";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useHabits } from "@/hooks/use-habits";
import { useTodayRecords } from "@/hooks/use-today-records";
import { samePlacement } from "@/lib/float-tile";
import type { FloatPlacement, Habit } from "@/types/habit";

type FloatPlacementModalProps = {
  visible: boolean;
  /** The habit as it will look: the editor's draft, not necessarily saved. */
  habit: Habit;
  placement: FloatPlacement;
  onSave: (placement: FloatPlacement) => void;
  onCancel: () => void;
};

/**
 * Placement mode for a floating tile, opened from the habit editor. The
 * real grid is drawn as on the home screen, locked, with this habit's tile
 * floating over it: drag to move, pinch to resize, snaps to the lines
 * between tiles. Nothing is written until Save; Cancel drops the moves. The
 * saved placement goes back into the editor, which persists it with the
 * habit, so a tile is never moved by accident on the home screen.
 */
export function FloatPlacementModal({
  visible,
  habit,
  placement,
  onSave,
  onCancel,
}: FloatPlacementModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      {/* Mounted per opening, so the draft starts from the saved placement
          each time without an effect. */}
      {visible && (
        <PlacementEditor
          habit={habit}
          placement={placement}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </Modal>
  );
}

function PlacementEditor({
  habit,
  placement,
  onSave,
  onCancel,
}: Omit<FloatPlacementModalProps, "visible">) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const insets = useSafeAreaInsets();
  const { habits } = useHabits();
  const { records } = useTodayRecords();

  const [draft, setDraft] = useState<FloatPlacement>(placement);
  const changed = !samePlacement(draft, placement);
  const noop = useCallback(() => {}, []);

  return (
    <GestureHandlerRootView
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={styles.navHeader}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <ThemedText style={[styles.cancelText, { color: colors.tint }]}>
            Cancel
          </ThemedText>
        </Pressable>
        <View style={styles.navTitleWrap} pointerEvents="none">
          <ThemedText style={styles.navTitle}>Place Tile</ThemedText>
        </View>
        <Pressable
          onPress={() => onSave(draft)}
          disabled={!changed}
          hitSlop={8}
        >
          <ThemedText
            style={[
              styles.saveText,
              { color: changed ? colors.tint : colors.icon },
              !changed && styles.saveDisabled,
            ]}
          >
            Save
          </ThemedText>
        </Pressable>
      </View>

      <TileGrid
        habits={habits}
        records={records}
        onTapHabit={noop}
        onLongPressHabit={noop}
        editingFloat={{ habit, float: draft, onChange: setDraft }}
      />

      <View style={styles.footer}>
        <ThemedText style={styles.hint}>
          Drag to move. Pinch to resize. It snaps to the lines between tiles.
        </ThemedText>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Mirrors the habit editor's header so the two screens read as one flow.
  navHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.2)",
  },
  navTitleWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  navTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
  saveText: {
    fontWeight: "600",
    fontSize: 16,
  },
  saveDisabled: {
    opacity: 0.4,
  },
  // About the height of the home screen's button row, so the grid above is
  // the size it will be there.
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: "center",
  },
  hint: {
    fontSize: 13,
    opacity: 0.6,
    lineHeight: 18,
    textAlign: "center",
  },
});
