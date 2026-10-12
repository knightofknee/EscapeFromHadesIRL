import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/auth-context';
import { useTour } from '@/contexts/tour-context';
import {
  checkForAppUpdate,
  isSnoozed,
  loadDismissRecord,
  saveDismissRecord,
  type AppUpdateInfo,
} from '@/lib/app-update';
import { fetchUpdateGate } from '@/lib/update-gate';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

// Minimum gap between config checks. Foreground events fire constantly during
// normal use; one check per half hour keeps the prompt near-immediate once a
// release is flipped live without hammering Firestore.
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Root-mounted nudge shown when the installed binary is behind
 * Config/app.latestVersion (see lib/app-update.ts for why the source of truth
 * is our own config doc, not the store). App Store updates aren't actually
 * automatic for everyone (auto-update can be off or delayed), and the goal is
 * getting fixes to active users fast — so this checks at launch AND on every
 * app foreground (throttled), not just at cold start. iOS apps stay resident
 * for days; waiting for a cold start would add days on top of Apple review.
 *
 * Purely a suggestion: Update deep-links to the store listing, and either
 * button snoozes the nudge for a day (persisted across relaunches; a later,
 * newer release re-prompts immediately). One nag per day, but nagging resumes
 * until the user is actually current. The Update button is deliberately the
 * loudest element on the card.
 */
export function UpdateModal() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { user } = useAuth();
  const { isActive: tourActive } = useTour();
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    let unmounted = false;

    async function runCheck() {
      if (Date.now() - lastCheckRef.current < CHECK_INTERVAL_MS) return;
      lastCheckRef.current = Date.now();
      const result = await checkForAppUpdate();
      if (unmounted || !result) return;
      // Below the hard floor UpdateRequiredGate owns the screen; this card is
      // a native Modal and would sit on top of it, so it stands aside.
      if (await fetchUpdateGate()) return;
      const dismissed = await loadDismissRecord();
      if (unmounted || isSnoozed(result.latestVersion, dismissed, Date.now())) return;
      setInfo(result);
    }

    runCheck();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runCheck();
    });
    return () => {
      unmounted = true;
      sub.remove();
    };
  }, []);

  // Hold the card back while signed out or mid-Genesis-tour: an update nudge
  // must not cover the login screen or a tour spotlight. The check result
  // stays in state, so it surfaces as soon as the gate clears.
  if (!info || !user || tourActive) return null;

  function openStore() {
    if (!info) return;
    // A store visit earns the same day of quiet as Close: whether they update
    // or bail, re-nagging sooner is noise.
    saveDismissRecord(info.latestVersion);
    Linking.openURL(info.storeUrl).catch(() => {});
  }

  function dismiss() {
    if (info) saveDismissRecord(info.latestVersion);
    setInfo(null);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.tileBackground }]}>
          <ThemedText style={styles.emoji}>🔥</ThemedText>
          <ThemedText type="defaultSemiBold" style={styles.title}>
            A new update awaits
          </ThemedText>
          <ThemedText style={styles.body}>
            {info.message ??
              "We've been forging a better Escape from Hades IRL. Would you grab the update? Thank you!"}
          </ThemedText>
          <Pressable
            style={[styles.updateButton, { backgroundColor: colors.tint }]}
            onPress={openStore}
            accessibilityRole="button"
            accessibilityLabel={Platform.OS === 'android' ? 'Update on Google Play' : 'Update on the App Store'}
          >
            <ThemedText style={styles.updateButtonText}>Update</ThemedText>
          </Pressable>
          <Pressable
            style={styles.closeButton}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Later"
            hitSlop={8}
          >
            <ThemedText style={[styles.closeButtonText, { color: colors.text }]}>
              Later
            </ThemedText>
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
  // The one action we want taken: full-width, tall, bold, tinted.
  updateButton: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  // Quiet escape hatch, visually subordinate to Update.
  closeButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  closeButtonText: {
    fontSize: 14,
    opacity: 0.6,
  },
});
