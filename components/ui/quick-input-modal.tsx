import { useState, useEffect, useCallback, useRef } from 'react';
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
import { stripLeadingZeros } from '@/lib/number-input';

type QuickInputModalProps = {
  visible: boolean;
  title: string;
  initialValue?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  /** Show +/- stepper buttons that increment/decrement by `step`. Floors at 0. */
  showStepper?: boolean;
  /**
   * Amount the +/- buttons move by. Defaults to 1. Only the buttons use it;
   * the typed field stays free. Non-finite or non-positive values fall back
   * to 1.
   */
  step?: number;
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export function QuickInputModal({
  visible,
  title,
  initialValue = '',
  keyboardType = 'default',
  showStepper = false,
  step = 1,
  onSubmit,
  onCancel,
}: QuickInputModalProps) {
  const stepSize = Number.isFinite(step) && step > 0 ? step : 1;
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isNumeric = keyboardType !== 'default';

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  // Numbers never show leading zeros: typing 4 over the pre-filled 0 is 4.
  const handleChangeText = useCallback(
    (text: string) => setValue(isNumeric ? stripLeadingZeros(text) : text),
    [isNumeric],
  );

  // selectTextOnFocus alone misses when autoFocus fires during the sheet's
  // slide-in, leaving the caret after the pre-filled value. Select it all
  // again once focus has settled so the first keystroke replaces it.
  const handleFocus = useCallback(() => {
    setTimeout(() => {
      const len = value.length;
      if (len > 0) inputRef.current?.setSelection(0, len);
    }, 50);
  }, [value]);

  const handleSubmit = useCallback(() => {
    onSubmit(value);
    setValue('');
  }, [onSubmit, value]);

  // Step by +/- one `stepSize`, parsing whatever numeric string is in the
  // field. Floors at 0 (habit values are conventionally non-negative).
  // Empty field treated as 0, so first tap of "+" yields the step.
  //
  // The Math.round(... * 1e10) / 1e10 trick rounds to 10 decimal places.
  // This kills IEEE 754 binary-float artifacts (e.g. 2.2 - 1 evaluating
  // to 1.2000000000000002) which always show up around digit 15–16,
  // without losing any precision a user would actually type.
  const handleStep = useCallback(
    (delta: number) => {
      const current = parseFloat(value);
      const safeCurrent = Number.isFinite(current) ? current : 0;
      const stepped = Math.round((safeCurrent + delta * stepSize) * 1e10) / 1e10;
      const next = Math.max(0, stepped);
      setValue(String(next));
    },
    [value, stepSize],
  );
  // The buttons say what they move by once it isn't the obvious 1.
  const stepLabel = stepSize === 1 ? '' : ` ${stepSize}`;

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
              ref={inputRef}
              value={value}
              onChangeText={handleChangeText}
              onFocus={handleFocus}
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
                  accessibilityLabel={`Decrease by ${stepSize}`}
                >
                  <ThemedText style={[styles.stepperText, { color: colors.tint }]}>
                    −{stepLabel}
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
                  accessibilityLabel={`Increase by ${stepSize}`}
                >
                  <ThemedText style={[styles.stepperText, { color: colors.tint }]}>
                    +{stepLabel}
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
