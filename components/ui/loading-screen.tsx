import { ActivityIndicator, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Full-area loading state shown while a screen's Firestore data arrives.
 * One shared treatment so every screen loads the same way instead of
 * flashing its empty state. Optional `message` for states that need a
 * word of context (e.g. waiting out a connection drop).
 */
export function LoadingScreen({ message }: { message?: string }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator size="large" color={colors.tint} />
      {message ? <ThemedText style={styles.message}>{message}</ThemedText> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    marginTop: 16,
    fontSize: 14,
    opacity: 0.6,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
