import { ActivityIndicator, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Full-area loading state shown while a screen's Firestore data arrives.
 * One shared treatment so every screen loads the same way instead of
 * flashing its empty state.
 */
export function LoadingScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator size="large" color={colors.tint} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
