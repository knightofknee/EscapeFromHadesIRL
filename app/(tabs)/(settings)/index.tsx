import { useState } from 'react';
import { StyleSheet, ScrollView, View, Pressable, Alert, Switch, Modal, Share, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useTags } from '@/hooks/use-tags';
import type { Tag } from '@/types/note';
import { useAuth } from '@/contexts/auth-context';
import { signOut } from '@/lib/firebase/auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearance } from '@/hooks/use-appearance';
import { useHomeScreen } from '@/hooks/use-home-screen';
import { useFreshNoteReset, FRESH_NOTE_RESET_OPTIONS } from '@/hooks/use-fresh-note-reset';

/** The app's page on waldgrave.com, with the store buttons. */
const APP_PAGE = 'https://www.waldgrave.com/escapefromhadesirl';
const IOS_REVIEW_URL = 'https://apps.apple.com/app/id6760863438?action=write-review';
const ANDROID_PACKAGE = 'com.briancarlisle.escapefromhadesirl';
/** Same contact address the privacy policy lists. */
const FEEDBACK_EMAIL = 'bricarlis@gmail.com';

export default function SettingsScreen() {
  // React Compiler memoization breaks the native Switch slide animation.
  'use no memo';
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { appearance, setAppearance } = useAppearance();
  const { homeScreen, setHomeScreen } = useHomeScreen();
  const { resetMinutes, setResetMinutes } = useFreshNoteReset();
  const { tags, setTagOrder } = useTags();

  // Keyword Order: reorder the tag chips shown on the notes list (one
  // scrollable line — the first few are the always-visible ones). Local
  // copy while the modal is open; every move persists immediately.
  const [keywordOrderOpen, setKeywordOrderOpen] = useState(false);
  const [orderedTags, setOrderedTags] = useState<Tag[]>([]);

  function openKeywordOrder() {
    setOrderedTags(tags);
    setKeywordOrderOpen(true);
  }

  function moveTag(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= orderedTags.length) return;
    const next = [...orderedTags];
    [next[index], next[j]] = [next[j], next[index]];
    setOrderedTags(next);
    void setTagOrder(next.map((t) => t.id));
  }
  // Off-state track: tileBorder blends into the card background (especially in
  // dark mode, #3A3D42 on #2C2F33), leaving the thumb floating on nothing.
  const offTrack = colorScheme === 'dark' ? '#5A5E66' : '#D8DBE0';

  async function shareApp() {
    const message = 'I use Escape from Hades IRL for my habits, notes, and chores.';
    try {
      // iOS renders `url` as a rich link; Android ignores it, so the link
      // rides in the message there.
      await Share.share(
        Platform.OS === 'ios' ? { message, url: APP_PAGE } : { message: `${message} ${APP_PAGE}` },
      );
    } catch {
      // The person closed the share sheet.
    }
  }

  async function rateApp() {
    // A button must land somewhere every time, so it opens the store's review
    // page rather than the OS rating prompt (which the OS may silently skip).
    if (Platform.OS === 'ios') {
      await Linking.openURL(IOS_REVIEW_URL).catch(() => {});
      return;
    }
    await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`).catch(() =>
      Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`).catch(() => {}),
    );
  }

  // Shown when no mail app takes the link: the address with a Copy button
  // (a system alert can't do either).
  const [feedbackCardOpen, setFeedbackCardOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  async function sendFeedback() {
    const version = Application.nativeApplicationVersion ?? '';
    const build = Application.nativeBuildVersion ?? '';
    const subject = encodeURIComponent('Escape from Hades IRL feedback');
    const body = encodeURIComponent(`\n\n${Platform.OS} ${version} (${build})`);
    const query = `subject=${subject}&body=${body}`;
    // The default mail app first; then Gmail directly, for people who use
    // Gmail without making it their default (or deleted Apple Mail).
    const attempts = [
      `mailto:${FEEDBACK_EMAIL}?${query}`,
      ...(Platform.OS === 'ios' ? [`googlegmail://co?to=${FEEDBACK_EMAIL}&${query}`] : []),
    ];
    for (const url of attempts) {
      try {
        await Linking.openURL(url);
        return;
      } catch {
        // not handled; try the next one
      }
    }
    setEmailCopied(false);
    setFeedbackCardOpen(true);
  }

  async function copyFeedbackEmail() {
    await Clipboard.setStringAsync(FEEDBACK_EMAIL);
    setEmailCopied(true);
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/sign-in');
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Account */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Account
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <View style={styles.row}>
            <ThemedText style={styles.label}>Email</ThemedText>
            <ThemedText style={styles.value}>{user?.email ?? 'Not signed in'}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText style={styles.label}>Provider</ThemedText>
            <ThemedText style={styles.value}>
              {user?.providerData[0]?.providerId === 'google.com'
                ? 'Google'
                : user?.providerData[0]?.providerId === 'apple.com'
                  ? 'Apple'
                  : 'Email'}
            </ThemedText>
          </View>
        </View>

        {/* Home Screen */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Home Screen
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Open to Notes</ThemedText>
              <ThemedText style={[styles.value, { opacity: 0.5, fontSize: 12, marginTop: 2 }]}>
                Opens the app to a fresh note, ready to write
              </ThemedText>
            </View>
            <Switch
              value={homeScreen === 'notes'}
              onValueChange={(v) => setHomeScreen(v ? 'notes' : 'default')}
              trackColor={{ false: offTrack, true: colors.tint }}
              ios_backgroundColor={offTrack}
              thumbColor="#fff"
            />
          </View>
          {/* New note reset: only meaningful while fresh-note-on-open is on.
              Below this window the app restores where you were instead. */}
          {homeScreen === 'notes' && (
            <>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.label}>New note reset</ThemedText>
                  <ThemedText style={[styles.value, { opacity: 0.5, fontSize: 12, marginTop: 2 }]}>
                    After this long away, opening the app starts a new note
                  </ThemedText>
                </View>
              </View>
              {FRESH_NOTE_RESET_OPTIONS.map((minutes) => (
                <Pressable
                  key={minutes}
                  style={[styles.row, styles.subRow]}
                  onPress={() => setResetMinutes(minutes)}
                >
                  <ThemedText style={styles.label}>
                    {minutes === 60 ? '1 hour' : `${minutes} minutes`}
                  </ThemedText>
                  {resetMinutes === minutes && (
                    <ThemedText style={{ color: colors.tint }}>✓</ThemedText>
                  )}
                </Pressable>
              ))}
            </>
          )}
        </View>

        {/* Keywords */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Keywords
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable style={styles.row} onPress={openKeywordOrder}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Keyword Order</ThemedText>
              <ThemedText style={[styles.value, { opacity: 0.5, fontSize: 12, marginTop: 2 }]}>
                The first keywords stay visible without scrolling
              </ThemedText>
            </View>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
        </View>

        {/* Appearance */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Appearance
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable
            style={styles.row}
            onPress={() => setAppearance('light')}
          >
            <ThemedText style={styles.label}>Light</ThemedText>
            {appearance === 'light' && <ThemedText style={{ color: colors.tint }}>✓</ThemedText>}
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => setAppearance('dark')}
          >
            <ThemedText style={styles.label}>Dark</ThemedText>
            {appearance === 'dark' && <ThemedText style={{ color: colors.tint }}>✓</ThemedText>}
          </Pressable>
        </View>

        {/* Data */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Data
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable
            style={styles.row}
            onPress={() => router.push('/export-notes')}
          >
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Export Notes</ThemedText>
              <ThemedText style={[styles.value, { opacity: 0.5, fontSize: 12, lineHeight: 16, marginTop: 4 }]}>
                Share your notes with an AI or another notes app.
              </ThemedText>
            </View>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => router.push('/media-transfer')}
          >
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Move Photos &amp; Videos</ThemedText>
              <ThemedText style={[styles.value, { opacity: 0.5, fontSize: 12, lineHeight: 16, marginTop: 4 }]}>
                Photos live on your phone while notes are in the cloud. Transfer your photos to your new phone.
              </ThemedText>
            </View>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
        </View>

        {/* Support (2026-10-09, from the Play testers' reports on bekin and
            direct democracy: share, rate, and feedback live in Settings). */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Support
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable style={styles.row} onPress={() => void shareApp()} accessibilityRole="button">
            <ThemedText style={styles.label}>Share the App</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
          <Pressable style={styles.row} onPress={() => void rateApp()} accessibilityRole="button">
            <ThemedText style={styles.label}>Rate the App</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
          <Pressable style={styles.row} onPress={() => void sendFeedback()} accessibilityRole="button">
            <ThemedText style={styles.label}>Send Feedback</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
        </View>

        {/* Additional Settings */}
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable
            style={styles.row}
            onPress={() => router.push('/(tabs)/(settings)/additional-settings')}
          >
            <ThemedText style={styles.label}>Additional Settings</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
        </View>

        {/* Sign Out */}
        <Pressable
          style={[styles.signOutButton, { borderColor: '#E74C3C' }]}
          onPress={handleSignOut}
        >
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
        </Pressable>
      </ScrollView>

      {/* Send Feedback fallback: no mail app took the link. */}
      <Modal
        visible={feedbackCardOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackCardOpen(false)}
      >
        <Pressable style={styles.orderBackdrop} onPress={() => setFeedbackCardOpen(false)}>
          <Pressable
            style={[styles.orderCard, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}
            onPress={() => {}}
          >
            <ThemedText style={styles.orderTitle}>Send Feedback</ThemedText>
            <ThemedText style={styles.orderSubtitle}>No mail app opened. Email us at:</ThemedText>
            <ThemedText selectable style={styles.feedbackEmail}>
              {FEEDBACK_EMAIL}
            </ThemedText>
            <View style={styles.feedbackButtons}>
              <Pressable
                style={[styles.feedbackCopy, { borderColor: colors.tint }]}
                onPress={() => void copyFeedbackEmail()}
                accessibilityRole="button"
              >
                <ThemedText style={[styles.feedbackCopyText, { color: colors.tint }]}>
                  {emailCopied ? 'Copied' : 'Copy Email'}
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.orderDone, styles.feedbackDone, { backgroundColor: colors.tint }]}
                onPress={() => setFeedbackCardOpen(false)}
                accessibilityRole="button"
              >
                <ThemedText style={styles.orderDoneText}>Done</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Keyword Order — themed card (never a native alert), reorder with
          up/down arrows, persists on every move. */}
      <Modal
        visible={keywordOrderOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setKeywordOrderOpen(false)}
      >
        <Pressable style={styles.orderBackdrop} onPress={() => setKeywordOrderOpen(false)}>
          {/* Inner press swallows taps so tapping the card doesn't dismiss. */}
          <Pressable
            style={[styles.orderCard, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}
            onPress={() => {}}
          >
            <ThemedText style={styles.orderTitle}>Keyword Order</ThemedText>
            <ThemedText style={styles.orderSubtitle}>
              Top of this list shows first on the notes page
            </ThemedText>
            <ScrollView style={styles.orderList}>
              {orderedTags.length === 0 && (
                <ThemedText style={styles.orderEmpty}>No keywords yet.</ThemedText>
              )}
              {orderedTags.map((tag, i) => (
                <View key={tag.id} style={styles.orderRow}>
                  <ThemedText
                    style={[styles.orderName, { color: tag.color ?? colors.tint }]}
                    numberOfLines={1}
                  >
                    {tag.name}
                  </ThemedText>
                  <Pressable
                    onPress={() => moveTag(i, -1)}
                    disabled={i === 0}
                    style={[styles.orderArrow, i === 0 && styles.orderArrowDisabled]}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${tag.name} up`}
                  >
                    <IconSymbol name="chevron.up" size={20} color={colors.icon} />
                  </Pressable>
                  <Pressable
                    onPress={() => moveTag(i, 1)}
                    disabled={i === orderedTags.length - 1}
                    style={[styles.orderArrow, i === orderedTags.length - 1 && styles.orderArrowDisabled]}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${tag.name} down`}
                  >
                    <IconSymbol name="chevron.down" size={20} color={colors.icon} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.orderDone, { backgroundColor: colors.tint }]}
              onPress={() => setKeywordOrderOpen(false)}
              accessibilityRole="button"
            >
              <ThemedText style={styles.orderDoneText}>Done</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  sectionHeader: { fontSize: 13, opacity: 0.5, marginTop: 12, marginLeft: 4, textTransform: 'uppercase' },
  card: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  label: { fontSize: 15 },
  subRow: { paddingLeft: 32, paddingVertical: 10 },
  value: { fontSize: 15, opacity: 0.6 },
  chevron: { fontSize: 20, opacity: 0.3, fontWeight: '300' },
  signOutButton: {
    marginTop: 24,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signOutText: { color: '#E74C3C', fontWeight: '600', fontSize: 16 },
  orderBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  orderCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
  orderTitle: { fontSize: 17, fontWeight: '700' },
  orderSubtitle: { fontSize: 13, opacity: 0.5, marginTop: 2, marginBottom: 10 },
  orderList: { maxHeight: 360 },
  orderEmpty: { opacity: 0.5, textAlign: 'center', paddingVertical: 20 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  orderName: { flex: 1, fontSize: 15, fontWeight: '600' },
  orderArrow: { padding: 6 },
  orderArrowDisabled: { opacity: 0.25 },
  orderDone: {
    marginTop: 12,
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 10,
  },
  orderDoneText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  feedbackEmail: { fontSize: 17, fontWeight: '600', marginTop: 4, marginBottom: 4 },
  feedbackButtons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 12 },
  feedbackCopy: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  feedbackCopyText: { fontWeight: '700', fontSize: 15 },
  feedbackDone: { marginTop: 0, alignSelf: 'auto' },
});
