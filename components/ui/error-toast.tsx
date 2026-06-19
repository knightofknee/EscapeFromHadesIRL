import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { subscribeErrors, type AppError } from '@/lib/error-bus';

// Auto-dismiss window. A little longer when a Retry is offered so the user has
// time to act on it.
const AUTO_DISMISS_MS = 6000;
// This mounts at the root (a sibling of the navigator) so there's no
// SafeAreaProvider ancestor — use a manual top inset to clear the status bar.
const TOP_INSET = Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 8;

/**
 * Single mount point (in the root layout) that listens on the error bus and
 * shows the latest user-facing error as a top banner with an optional Retry.
 * Producers anywhere call emitError(); they don't need React context.
 */
export function ErrorToast() {
  const [error, setError] = useState<AppError | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = subscribeErrors((err) => {
      setError(err);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setError(null), AUTO_DISMISS_MS);
    });
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!error) return null;

  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    setError(null);
  };
  const retry = error.retry;

  return (
    <View style={[styles.safe, { top: TOP_INSET }]} pointerEvents="box-none">
      <View style={styles.banner} accessibilityRole="alert" accessibilityLabel={error.message}>
        <ThemedText style={styles.message} numberOfLines={3}>
          {error.message}
        </ThemedText>
        <View style={styles.actions}>
          {retry && (
            <Pressable
              onPress={() => {
                dismiss();
                retry();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <ThemedText style={styles.retry}>Retry</ThemedText>
            </Pressable>
          )}
          <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
            <ThemedText style={styles.dismiss}>Dismiss</ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  banner: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: '#B3261E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  message: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  retry: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  dismiss: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
});
