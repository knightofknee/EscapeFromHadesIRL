import { useState, useEffect } from 'react';
import { StyleSheet, Modal, TextInput, Pressable, View, KeyboardAvoidingView, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type QuickInputModalProps = {
  visible: boolean;
  title: string;
  initialValue?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export function QuickInputModal({
  visible,
  title,
  initialValue = '',
  keyboardType = 'default',
  onSubmit,
  onCancel,
}: QuickInputModalProps) {
  const [value, setValue] = useState(initialValue);
  const colorScheme = useColorScheme();

  // Reset value when modal opens or initialValue changes
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);
  const colors = Colors[colorScheme ?? 'light'];

  function handleSubmit() {
    onSubmit(value);
    setValue('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.content, { backgroundColor: colors.tileBackground }]}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            {title}
          </ThemedText>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
            value={value}
            onChangeText={setValue}
            keyboardType={keyboardType}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          <View style={styles.buttons}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
              <ThemedText>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, { backgroundColor: colors.tint }]}
              onPress={handleSubmit}
            >
              <ThemedText style={styles.submitText}>Save</ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    width: '80%',
    maxWidth: 320,
    borderRadius: 12,
    padding: 20,
    gap: 16,
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
