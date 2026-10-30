import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { KeyboardDismissBar, KEYBOARD_DISMISS_BAR_HEIGHT } from '@/components/ui/keyboard-dismiss-bar';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/auth-context';
import { ACCEPT_MESSAGES, inviteUrl, useFriends } from '@/contexts/friends-context';
import { getNotificationPermissionBucket, requestNotificationPermission } from '@/lib/meditation-notifications';
import { registerPushToken } from '@/lib/push-tokens';

/**
 * Chore friends: who you can share chores with. Invite by link (or the code
 * in it), add someone by their code, set the name friends see, and remove a
 * friend (tap them; removing sits behind a confirm, not on the row).
 */
export default function ChoreFriendsScreen() {
  const { user } = useAuth();
  const { friends, myName, setMyName, createInvite, acceptInvite, removeFriend } = useFriends();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [name, setName] = useState(myName);
  const [nameTouched, setNameTouched] = useState(false);
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState<'granted' | 'denied' | 'undetermined' | null>(null);

  // Take the stored name once it loads, unless the user already started typing.
  useEffect(() => {
    if (!nameTouched) setName(myName);
  }, [myName, nameTouched]);

  useEffect(() => {
    void getNotificationPermissionBucket().then(setNotifications);
  }, []);

  async function saveName() {
    if (name.trim() === myName) return;
    await setMyName(name);
  }

  async function shareInvite() {
    setBusy(true);
    const fresh = invite ?? (await createInvite());
    setBusy(false);
    if (!fresh) return;
    setInvite(fresh);
    const who = myName.trim() || 'A friend';
    await Share.share({
      message: `${who} wants to share chores with you on Escape from Hades IRL: ${inviteUrl(fresh)}\n\nOr open Chores, tap +, then Chore friends, and enter code ${fresh}.`,
    });
  }

  async function addByCode() {
    setBusy(true);
    const result = await acceptInvite(code);
    setBusy(false);
    setMessage(ACCEPT_MESSAGES[result]);
    if (result === 'ok') setCode('');
  }

  async function enableNotifications() {
    if (notifications === 'denied') {
      void Linking.openSettings();
      return;
    }
    const granted = await requestNotificationPermission();
    setNotifications(granted ? 'granted' : 'denied');
    if (granted && user) void registerPushToken(user.uid);
  }

  function confirmRemove(uid: string, friendName: string) {
    Alert.alert(friendName, 'Remove as a chore friend? Chores you already share stay shared until the owner changes them.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeFriend(uid) },
    ]);
  }

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.tileBorder }];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.navHeader}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.navButton, { color: colors.tint }]}>Done</ThemedText>
          </Pressable>
          <View style={styles.navTitleWrap} pointerEvents="none">
            <ThemedText style={styles.navTitle}>Chore friends</ThemedText>
          </View>
        </View>
      </SafeAreaView>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={KEYBOARD_DISMISS_BAR_HEIGHT + 16}
        extraKeyboardSpace={KEYBOARD_DISMISS_BAR_HEIGHT}
      >
        <ThemedText style={styles.intro}>
          Share a chore with someone and either of you can mark it done. You both see how long
          it&apos;s been, and whether it&apos;s due.
        </ThemedText>

        <ThemedText type="defaultSemiBold" style={styles.label}>
          Your name
        </ThemedText>
        <TextInput
          style={inputStyle}
          value={name}
          onChangeText={(t) => {
            setNameTouched(true);
            setName(t);
          }}
          onBlur={() => void saveName()}
          onSubmitEditing={() => void saveName()}
          placeholder="What friends see"
          placeholderTextColor={colors.icon}
          maxLength={40}
          returnKeyType="done"
        />

        <Pressable
          style={[styles.primary, { backgroundColor: colors.tint }, busy && styles.dim]}
          onPress={() => void shareInvite()}
          disabled={busy}
          accessibilityRole="button"
        >
          <ThemedText style={styles.primaryText}>Invite a friend</ThemedText>
        </Pressable>
        {invite && (
          <Pressable onPress={() => void Clipboard.setStringAsync(invite)} accessibilityRole="button">
            <ThemedText style={styles.hint}>
              {`Your code: ${invite}. Works for 14 days, for anyone you send it to. Tap to copy.`}
            </ThemedText>
          </Pressable>
        )}

        <ThemedText type="defaultSemiBold" style={styles.label}>
          Have a code?
        </ThemedText>
        <View style={styles.codeRow}>
          <TextInput
            style={[inputStyle, styles.codeInput]}
            value={code}
            onChangeText={(t) => {
              setCode(t);
              setMessage(null);
            }}
            placeholder="ABCD234XYZ"
            placeholderTextColor={colors.icon}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={() => void addByCode()}
          />
          <Pressable
            style={[styles.addButton, { borderColor: colors.tint }, (!code.trim() || busy) && styles.dim]}
            onPress={() => void addByCode()}
            disabled={!code.trim() || busy}
            accessibilityRole="button"
          >
            <ThemedText style={[styles.addText, { color: colors.tint }]}>Add</ThemedText>
          </Pressable>
        </View>
        {message && <ThemedText style={styles.message}>{message}</ThemedText>}

        <ThemedText type="defaultSemiBold" style={styles.label}>
          Friends
        </ThemedText>
        {friends.length === 0 ? (
          <ThemedText style={styles.hint}>None yet. Send an invite, or add a friend&apos;s code.</ThemedText>
        ) : (
          friends.map((f) => (
            <Pressable
              key={f.uid}
              style={[styles.friendRow, { borderColor: colors.tileBorder, backgroundColor: colors.tileBackground }]}
              onPress={() => confirmRemove(f.uid, f.name)}
              accessibilityRole="button"
              accessibilityHint="Opens the option to remove this friend"
            >
              <ThemedText style={styles.friendName}>{f.name}</ThemedText>
              <ThemedText style={[styles.chevron, { color: colors.icon }]}>›</ThemedText>
            </Pressable>
          ))
        )}

        {notifications !== null && notifications !== 'granted' && (
          <Pressable onPress={() => void enableNotifications()} accessibilityRole="button" style={styles.notifyRow}>
            <ThemedText style={styles.hint}>
              Notifications are off, so you won&apos;t hear when a friend does a shared chore or
              shares one with you.{' '}
              <ThemedText style={[styles.hint, styles.link, { color: colors.tint }]}>
                {notifications === 'denied' ? 'Turn them on in Settings' : 'Turn them on'}
              </ThemedText>
            </ThemedText>
          </Pressable>
        )}
      </KeyboardAwareScrollView>
      <KeyboardDismissBar />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  navTitleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  navTitle: { fontSize: 17, fontWeight: '600' },
  navButton: { fontSize: 16, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 60 },
  intro: { fontSize: 15, lineHeight: 21, opacity: 0.8 },
  label: { marginTop: 20, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  primary: { marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.5 },
  hint: { fontSize: 13, opacity: 0.65, marginTop: 8, lineHeight: 18 },
  link: { opacity: 1, fontWeight: '600' },
  codeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  codeInput: { flex: 1, letterSpacing: 1.5 },
  addButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  addText: { fontSize: 16, fontWeight: '700' },
  message: { fontSize: 14, marginTop: 8, fontWeight: '600' },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  friendName: { flex: 1, fontSize: 16, fontWeight: '600' },
  chevron: { fontSize: 22 },
  notifyRow: { marginTop: 20 },
});
