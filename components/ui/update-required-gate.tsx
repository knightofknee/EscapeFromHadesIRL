import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchUpdateGate, type UpdateGate } from '@/lib/update-gate';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View } from 'react-native';

/**
 * Full-screen block for builds older than Config/app.minVersion (see
 * lib/update-gate.ts). Mounted LAST at the root so it paints over the
 * navigator, tour, and toasts, and deliberately not tied to auth or the tour:
 * an out-of-date build is out of date on the sign-in screen too. Renders
 * nothing in the normal case, and nothing when the config is missing or
 * unreadable (fail-open). No skip button on purpose.
 *
 * Re-checks on every foreground, so the screen clears itself once the user
 * comes back from the store on a newer build (or the floor is lowered).
 */
export function UpdateRequiredGate() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [gate, setGate] = useState<UpdateGate | null>(null);

  const check = useCallback(async () => {
    setGate(await fetchUpdateGate());
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  if (!gate) return null;

  return (
    <View
      style={[styles.overlay, { backgroundColor: colors.background }]}
      accessibilityViewIsModal
      pointerEvents="auto">
      <View style={styles.inner}>
        <ThemedText style={styles.emoji}>⚡️</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.title}>
          Time to level up
        </ThemedText>
        <ThemedText style={styles.body}>
          {gate.message ??
            "This version can't make the climb anymore. Please update from the store. Thank you!"}
        </ThemedText>
        {gate.storeUrl ? (
          <Pressable
            style={[styles.updateButton, { backgroundColor: colors.tint }]}
            onPress={() => Linking.openURL(gate.storeUrl!).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel="Update from the store">
            <ThemedText style={styles.updateButtonText}>Update</ThemedText>
          </Pressable>
        ) : (
          <ThemedText style={styles.body}>Please update Escape from Hades IRL from the store to continue.</ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 28,
    alignItems: 'center',
    gap: 12,
  },
  emoji: { fontSize: 40, lineHeight: 46 },
  title: { fontSize: 22, lineHeight: 28, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', opacity: 0.85 },
  updateButton: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  updateButtonText: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
});
