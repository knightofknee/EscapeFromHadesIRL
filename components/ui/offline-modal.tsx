import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useOfflineGuard } from '@/contexts/offline-context';

/**
 * Single root-mounted modal that surfaces the offline state honestly.
 *
 * The app saves to Firestore's (memory-only) cache and requires a connection
 * to persist — offline writes are blocked (see requireOnline) rather than
 * accepted-then-silently-lost. This modal is the explanation layer for that:
 * when the app goes offline it shows a click-through card telling the user
 * their changes won't save until they reconnect, while still letting them look
 * around at already-loaded data.
 *
 * Shown once per offline episode: dismissible, auto-hides when the connection
 * returns, and re-arms for the next time the app drops offline.
 */
export function OfflineModal() {
  const { isOffline } = useOfflineGuard();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [visible, setVisible] = useState(false);
  // Don't re-show after the user dismisses until they've been back online.
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (isOffline) {
      if (!dismissedRef.current) setVisible(true);
    } else {
      dismissedRef.current = false;
      setVisible(false);
    }
  }, [isOffline]);

  function dismiss() {
    dismissedRef.current = true;
    setVisible(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.tileBackground }]}>
          <ThemedText style={styles.emoji}>📡</ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            You&apos;re offline
          </ThemedText>
          <ThemedText style={styles.body}>
            Escape from Hades saves your progress to the cloud, so it needs a
            connection. You can keep looking around, but anything you change
            won&apos;t be saved until you&apos;re back online.
          </ThemedText>
          <Pressable
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Got it"
          >
            <ThemedText style={styles.buttonText}>Got it</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 40,
    lineHeight: 46,
  },
  title: {
    fontSize: 18,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    opacity: 0.85,
  },
  button: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 32,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
