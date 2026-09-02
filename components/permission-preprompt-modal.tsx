import { useRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Standard in-app explanation shown BEFORE a system permission sheet. The
 * system sheet alone doesn't say why the app wants the access; this does.
 *
 * App Review (5.1.1(iv)) requires that a message shown ahead of a permission
 * request ALWAYS proceeds to the system sheet — no way to dismiss around it.
 * So there is a single Continue button, tapping the overlay does nothing,
 * and the Android back gesture proceeds the same as Continue. The user's
 * actual choice happens on the system sheet itself.
 */
export function PermissionPrePromptModal({
  visible,
  title,
  body,
  onProceed,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  /** Fire the system permission request (and any follow-up work). */
  onProceed: () => Promise<void>;
  /** Called when the flow ends. */
  onClose: () => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  // Continue and the back gesture share this path; the guard keeps a double
  // trigger from requesting twice.
  const proceedingRef = useRef(false);
  const proceed = async () => {
    if (proceedingRef.current) return;
    proceedingRef.current = true;
    try {
      await onProceed();
    } finally {
      proceedingRef.current = false;
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={proceed}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.tileBackground }]}>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText style={styles.body}>{body}</ThemedText>
          <View style={styles.buttons}>
            <Pressable style={[styles.primary, { backgroundColor: colors.tint }]} onPress={proceed}>
              <ThemedText style={styles.primaryText}>Continue</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  sheet: {
    alignSelf: 'stretch',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 18,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.9,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  primary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
