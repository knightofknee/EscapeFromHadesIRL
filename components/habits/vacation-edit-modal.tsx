import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { TILE_COLORS } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  updateVacationDay,
  updateVacationDaysBulk,
  deleteVacationDay,
  deleteVacationDaysBulk,
} from '@/lib/vacation-days';
import { useOfflineGuard } from '@/contexts/offline-context';
import { emitError } from '@/lib/error-bus';

const MAX_LABEL_CHARS = 500;

type VacationEditModalProps = {
  visible: boolean;
  userId: string;
  date: string; // YYYY-MM-DD of the day being edited
  initialLabel: string;
  initialColor: string;
  /** Full contiguous block of vacation dates this day belongs to. */
  contiguousBlock: string[];
  onClose: () => void;
};

type Scope = 'day' | 'block';

/**
 * Long-press editor for a vacation day. Edits label + color, with an
 * optional "apply to full vacation" scope when the day is part of a
 * contiguous block. Also supports removing vacation status (unhiding
 * underlying habit records).
 */
export function VacationEditModal({
  visible,
  userId,
  date,
  initialLabel,
  initialColor,
  contiguousBlock,
  onClose,
}: VacationEditModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const blue = colors.vacationButton;
  const { requireOnline } = useOfflineGuard();

  const [label, setLabel] = useState(initialLabel);
  const [color, setColor] = useState(initialColor);
  const [scope, setScope] = useState<Scope>('day');
  const [submitting, setSubmitting] = useState(false);

  const blockSize = contiguousBlock.length;
  const hasBlock = blockSize > 1;

  // Reset state every time the modal opens with a new day.
  useEffect(() => {
    if (visible) {
      setLabel(initialLabel);
      setColor(initialColor);
      setScope('day');
      setSubmitting(false);
    }
  }, [visible, initialLabel, initialColor, date]);

  const targetDates = useMemo(() => {
    return scope === 'block' ? contiguousBlock : [date];
  }, [scope, contiguousBlock, date]);

  // Both writes are fire-and-forget: latency compensation updates the tile
  // immediately, and awaiting the server ack behind a disabled button would
  // hang the modal for minutes on a flaky-but-"online" connection (the same
  // bug fixed for setting vacation days). On failure we surface a toast with
  // a Retry instead of freezing.
  function handleSave() {
    if (submitting) return;
    if (!requireOnline()) return;
    const trimmed = label.slice(0, MAX_LABEL_CHARS);
    const isBlock = scope === 'block' && hasBlock;
    const dates = targetDates;
    const write = () => {
      const p = isBlock
        ? updateVacationDaysBulk({ userId, dates, label: trimmed, color })
        : updateVacationDay({ userId, date, label: trimmed, color });
      p.catch((err) => {
        console.error('Failed to save vacation day:', err);
        emitError("Couldn't save the vacation day. Check your connection and try again.", write);
      });
    };
    write();
    onClose();
  }

  function handleRemove() {
    if (submitting) return;
    if (!requireOnline()) return;
    const isBlock = scope === 'block' && hasBlock;
    const dates = targetDates;
    const write = () => {
      const p = isBlock
        ? deleteVacationDaysBulk({ userId, dates })
        : deleteVacationDay({ userId, date });
      p.catch((err) => {
        console.error('Failed to remove vacation day:', err);
        emitError("Couldn't remove the vacation day. Check your connection and try again.", write);
      });
    };
    write();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Tap-outside-to-dismiss: outer Pressable handles backdrop taps,
            inner Pressable stops propagation so taps inside the sheet
            don't close it. */}
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable
            style={[styles.content, { backgroundColor: colors.tileBackground }]}
            onPress={(e) => e.stopPropagation()}
          >
          <ThemedText type="defaultSemiBold" style={styles.title}>
            Edit Vacation Day
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {prettyDate(date)}
          </ThemedText>

          {hasBlock && (
            <View style={[styles.scopeRow, { borderColor: colors.tileBorder }]}>
              <Pressable
                style={[
                  styles.scopeButton,
                  scope === 'day' && { backgroundColor: `${blue}25` },
                ]}
                onPress={() => setScope('day')}
              >
                <ThemedText
                  style={[
                    styles.scopeText,
                    scope === 'day' && { color: blue, fontWeight: '700' },
                  ]}
                >
                  This day only
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.scopeButton,
                  scope === 'block' && { backgroundColor: `${blue}25` },
                ]}
                onPress={() => setScope('block')}
              >
                <ThemedText
                  style={[
                    styles.scopeText,
                    scope === 'block' && { color: blue, fontWeight: '700' },
                  ]}
                >
                  Full vacation ({blockSize} days)
                </ThemedText>
              </Pressable>
            </View>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText style={styles.fieldLabel}>Label</ThemedText>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.tileBorder },
              ]}
              value={label}
              onChangeText={(t) => setLabel(t.slice(0, MAX_LABEL_CHARS))}
              multiline
              placeholder="V"
              placeholderTextColor={colors.tileBorder}
            />
            <ThemedText style={styles.charCount}>
              {label.length} / {MAX_LABEL_CHARS}
            </ThemedText>

            <ThemedText style={styles.fieldLabel}>Color</ThemedText>
            <View style={styles.colorGrid}>
              {TILE_COLORS.map((c) => (
                <Pressable
                  key={c}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    color === c && [
                      styles.colorSwatchSelected,
                      { borderColor: colors.text },
                    ],
                  ]}
                  onPress={() => setColor(c)}
                  accessibilityLabel={`Select color ${c}`}
                />
              ))}
            </View>
          </ScrollView>

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={submitting}
            >
              <ThemedText>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: blue, opacity: submitting ? 0.6 : 1 }]}
              onPress={handleSave}
              disabled={submitting}
            >
              <ThemedText style={styles.confirmText}>Save</ThemedText>
            </Pressable>
          </View>

            <Pressable
              style={[styles.removeButton, { borderColor: colors.tint }]}
              onPress={handleRemove}
              disabled={submitting}
            >
              <ThemedText style={[styles.removeText, { color: colors.tint }]}>
                {scope === 'block' && hasBlock
                  ? `Remove vacation (${blockSize} days)`
                  : 'Remove vacation'}
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  kav: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
  },
  content: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: 13,
    opacity: 0.7,
    marginTop: -4,
  },
  scopeRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  scopeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  scopeText: {
    fontSize: 13,
  },
  scroll: {
    maxHeight: 320,
  },
  scrollContent: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
    marginTop: 4,
  },
  input: {
    minHeight: 60,
    maxHeight: 160,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    opacity: 0.5,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  colorSwatchSelected: {
    borderWidth: 3,
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
  removeButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
