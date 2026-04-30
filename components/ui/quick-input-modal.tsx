import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type QuickInputModalProps = {
  visible: boolean;
  title: string;
  initialValue?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  /** Show +/- stepper buttons that increment/decrement by 1. Floors at 0. */
  showStepper?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export function QuickInputModal({
  visible,
  title,
  initialValue = '',
  keyboardType = 'default',
  showStepper = false,
  onSubmit,
  onCancel,
}: QuickInputModalProps) {
  const [value, setValue] = useState(initialValue);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const handleSubmit = useCallback(() => {
    onSubmit(value);
    setValue('');
  }, [onSubmit, value]);

  // Step by +/- delta, parsing whatever numeric string is in the field.
  // Floors at 0 (habit values are conventionally non-negative). Empty
  // field treated as 0, so first tap of "+" yields "1".
  const handleStep = useCallback(
    (delta: number) => {
      const current = parseFloat(value);
      const safeCurrent = Number.isFinite(current) ? current : 0;
      const next = Math.max(0, safeCurrent + delta);
      setValue(String(next));
    },
    [value],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Tap outside the sheet to dismiss. */}
        <Pressable style={styles.overlay} onPress={onCancel}>
          <Pressable
            style={[styles.content, { backgroundColor: colors.tileBackground }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ThemedText type="defaultSemiBold" style={styles.title}>
              {title}
            </ThemedText>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.tileBorder },
              ]}
              value={value}
              onChangeText={setValue}
              keyboardType={keyboardType}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleSubmit}
              returnKeyType="done"
            />

            {showStepper && (
              <View style={styles.stepperRow}>
                <Pressable
                  style={[
                    styles.stepperButton,
                    {
                      borderColor: colors.tint,
                      backgroundColor: `${colors.tint}15`,
                    },
                  ]}
                  onPress={() => handleStep(-1)}
                  accessibilityLabel="Decrease by 1"
                >
                  <ThemedText style={[styles.stepperText, { color: colors.tint }]}>
                    −
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.stepperButton,
                    {
                      borderColor: colors.tint,
                      backgroundColor: `${colors.tint}15`,
                    },
                  ]}
                  onPress={() => handleStep(1)}
                  accessibilityLabel="Increase by 1"
                >
                  <ThemedText style={[styles.stepperText, { color: colors.tint }]}>
                    +
                  </ThemedText>
                </Pressable>
              </View>
            )}

            <View style={styles.buttons}>
              <Pressable
                style={[styles.button, styles.cancelButton]}
                onPress={onCancel}
              >
                <ThemedText>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleSubmit}
              >
                <ThemedText style={styles.submitText}>Save</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: {
    flex: 1,
  },
  // Bottom-anchored: the sheet sits just above the keyboard, not centered.
  // KeyboardAvoidingView (padding behavior on iOS) pushes the whole stack
  // up by keyboard height when the keyboard appears.
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    padding: 20,
    gap: 14,
  },
  title: {
    textAlign: 'center',
    fontSize: 16,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 18,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stepperButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperText: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
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
  submitText: {
    color: '#fff',
    fontWeight: '600',
  },
});
