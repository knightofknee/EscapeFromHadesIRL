import { useState } from 'react';
import { StyleSheet, ScrollView, View, Pressable, Alert, Switch, Modal, Share, Linking, Platform, TextInput } from 'react-native';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
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
import {
  useFreshNoteReset,
  FRESH_NOTE_RESET_OPTIONS,
  MIN_FRESH_NOTE_RESET_MINUTES,
  MAX_FRESH_NOTE_RESET_MINUTES,
} from '@/hooks/use-fresh-note-reset';
import { useUserSettingsContext } from '@/contexts/user-settings-context';
import { BirthdayModal, formatBirthday } from '@/components/settings/birthday-modal';

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
  // New note reset: quick-pick chips plus a free minutes field. The field
  // mirrors the stored value, and follows it when storage loads after mount.
  const [resetText, setResetText] = useState(String(resetMinutes));
  const [syncedResetMinutes, setSyncedResetMinutes] = useState(resetMinutes);
  if (resetMinutes !== syncedResetMinutes) {
    setSyncedResetMinutes(resetMinutes);
    if (parseInt(resetText, 10) !== resetMinutes) setResetText(String(resetMinutes));
  }
  const resetIsPreset = (FRESH_NOTE_RESET_OPTIONS as readonly number[]).includes(resetMinutes);

  function pickResetMinutes(minutes: number) {
    setResetMinutes(minutes);
    setResetText(String(minutes));
  }
  const { tags, setTagOrder } = useTags();
  const { birthday, setBirthday, weekStartsOn, setWeekStartsOn } = useUserSettingsContext();
  const [birthdayOpen, setBirthdayOpen] = useState(false);

  // Keyword Order: reorder the tag chips shown on the notes list (one
  // scrollable line — the first few are the always-visible ones). Local
  // copy while the modal is open. A drag persists once on drop; the
  // chevrons (kept for accessibility) persist on every tap.
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
              <View style={styles.resetBlock}>
                <View style={styles.resetChips}>
                  {FRESH_NOTE_RESET_OPTIONS.map((minutes) => {
                    const active = resetMinutes === minutes;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => pickResetMinutes(minutes)}
                        style={[
                          styles.resetChip,
                          {
                            borderColor: active ? colors.tint : colors.tileBorder,
                            backgroundColor: active ? `${colors.tint}20` : 'transparent',
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <ThemedText style={styles.resetChipText}>
                          {minutes === 60 ? '1 hour' : `${minutes} min`}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.resetCustomRow}>
                  <ThemedText style={styles.resetCustomLabel}>After</ThemedText>
                  <TextInput
                    style={[
                      styles.resetCustomInput,
                      { color: colors.text, borderColor: !resetIsPreset ? colors.tint : colors.tileBorder },
                    ]}
                    value={resetText}
                    placeholder="–"
                    placeholderTextColor={colors.icon}
                    onChangeText={(t) => {
                      const digits = t.replace(/[^0-9]/g, '');
                      setResetText(digits);
                      const n = parseInt(digits, 10);
                      if (!isNaN(n) && n >= MIN_FRESH_NOTE_RESET_MINUTES) {
                        setResetMinutes(Math.min(MAX_FRESH_NOTE_RESET_MINUTES, n));
                      }
                    }}
                    // Show the stored value once editing ends, so a cleared
                    // field or a number past the limit reads back as what
                    // was kept.
                    onBlur={() => setResetText(String(resetMinutes))}
                    keyboardType="number-pad"
                    maxLength={4}
                    accessibilityLabel="New note reset, minutes"
                  />
                  <ThemedText style={styles.resetCustomLabel}>
                    {resetMinutes === 1 ? 'minute' : 'minutes'}
                  </ThemedText>
                </View>
                <ThemedText style={[styles.value, { opacity: 0.5, fontSize: 12 }]}>
                  {MIN_FRESH_NOTE_RESET_MINUTES} to {MAX_FRESH_NOTE_RESET_MINUTES} minutes (one day)
                </ThemedText>
              </View>
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

        {/* One first day of the week for every grid: week strip, month
            heatmap, chore calendar, PDFs. */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Week starts on
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable style={styles.row} onPress={() => setWeekStartsOn(1)} accessibilityRole="button" accessibilityState={{ selected: weekStartsOn === 1 }}>
            <ThemedText style={styles.label}>Monday</ThemedText>
            {weekStartsOn === 1 && <ThemedText style={{ color: colors.tint }}>✓</ThemedText>}
          </Pressable>
          <Pressable style={styles.row} onPress={() => setWeekStartsOn(0)} accessibilityRole="button" accessibilityState={{ selected: weekStartsOn === 0 }}>
            <ThemedText style={styles.label}>Sunday</ThemedText>
            {weekStartsOn === 0 && <ThemedText style={{ color: colors.tint }}>✓</ThemedText>}
          </Pressable>
          <ThemedText style={[styles.value, { opacity: 0.5, fontSize: 12, paddingHorizontal: 16, paddingBottom: 12 }]}>
            Applies to the week view, month calendar, chore calendars, and PDFs.
          </ThemedText>
        </View>

        {/* 60-day quest: birthday week is win-only. Never prompted; it's
            just here to be found. */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          60-Day Quest
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }]} onPress={() => setBirthdayOpen(true)} accessibilityRole="button">
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ThemedText style={[styles.label, { flex: 1 }]}>Birthday</ThemedText>
              <ThemedText style={styles.value}>{birthday ? formatBirthday(birthday) : 'Not set'}</ThemedText>
              <ThemedText style={[styles.chevron, { marginLeft: 8 }]}>›</ThemedText>
            </View>
            <ThemedText style={[styles.value, { opacity: 0.5, fontSize: 12, lineHeight: 16, marginTop: 4 }]}>
              Your birthday week is win-only for 60-day quests: a recorded day counts, a missed day is
              ignored.
            </ThemedText>
          </Pressable>
        </View>
        <BirthdayModal
          visible={birthdayOpen}
          value={birthday}
          onSave={setBirthday}
          onClose={() => setBirthdayOpen(false)}
        />

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

      {/* Keyword Order — themed card (never a native alert). Long-press the
          handle to drag a row (one write on drop); up/down arrows stay as
          the accessible fallback. The gesture root is needed because a
          Modal is its own native view tree on Android. */}
      <Modal
        visible={keywordOrderOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setKeywordOrderOpen(false)}
      >
        <GestureHandlerRootView style={styles.orderRoot}>
        <Pressable style={styles.orderBackdrop} onPress={() => setKeywordOrderOpen(false)}>
          {/* Inner press swallows taps so tapping the card doesn't dismiss. */}
          <Pressable
            style={[styles.orderCard, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}
            onPress={() => {}}
          >
            <ThemedText style={styles.orderTitle}>Keyword Order</ThemedText>
            <ThemedText style={styles.orderSubtitle}>
              Top of this list shows first on the notes page. Hold the handle to drag.
            </ThemedText>
            {orderedTags.length === 0 ? (
              <ThemedText style={styles.orderEmpty}>No keywords yet.</ThemedText>
            ) : (
              <DraggableFlatList
                data={orderedTags}
                keyExtractor={(tag) => tag.id}
                style={styles.orderList}
                // The list is the scroller here (the card has no other), so
                // it autoscrolls while a row is dragged past its edge.
                onDragEnd={({ data }) => {
                  setOrderedTags(data);
                  void setTagOrder(data.map((t) => t.id));
                }}
                // The library shifts rows with a spring; clamp the overshoot
                // so nothing bounces.
                animationConfig={{ overshootClamping: true }}
                renderItem={({ item: tag, getIndex, drag, isActive }: RenderItemParams<Tag>) => {
                  const i = getIndex() ?? 0;
                  return (
                    <ScaleDecorator>
                      <View
                        style={[
                          styles.orderRow,
                          // Opaque while lifted so the scaled row covers its
                          // neighbours instead of showing them through.
                          isActive && { backgroundColor: colors.tileBackground },
                        ]}
                      >
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
                        <Pressable
                          onLongPress={drag}
                          delayLongPress={200}
                          disabled={isActive}
                          hitSlop={8}
                          style={styles.orderHandle}
                          accessibilityLabel={`Drag ${tag.name} to reorder`}
                        >
                          <Ionicons name="reorder-three" size={22} color={colors.icon} />
                        </Pressable>
                      </View>
                    </ScaleDecorator>
                  );
                }}
              />
            )}
            <Pressable
              style={[styles.orderDone, { backgroundColor: colors.tint }]}
              onPress={() => setKeywordOrderOpen(false)}
              accessibilityRole="button"
            >
              <ThemedText style={styles.orderDoneText}>Done</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
        </GestureHandlerRootView>
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
  resetBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  resetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resetChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  resetChipText: { fontSize: 14 },
  resetCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resetCustomLabel: { fontSize: 15 },
  resetCustomInput: {
    borderWidth: 1,
    borderRadius: 10,
    width: 72,
    paddingVertical: 8,
    fontSize: 16,
    textAlign: 'center',
  },
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
  orderRoot: { flex: 1 },
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
  orderHandle: { paddingLeft: 8, paddingRight: 2, paddingVertical: 4 },
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
