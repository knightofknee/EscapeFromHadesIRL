import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/auth-context';
import {
  ACCEPT_MESSAGES,
  FRIEND_INVITES_COLLECTION,
  PROFILES_COLLECTION,
  normalizeCode,
  useFriends,
} from '@/contexts/friends-context';
import { db, doc, getDoc } from '@/lib/firebase/firestore';

/**
 * Where an invite link lands (escapefromhadesirl://friend/CODE, or the
 * www.waldgrave.com link once the app claims it). Shows who's asking, then
 * Accept makes you chore friends.
 */
export default function FriendInviteScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = normalizeCode(raw ?? '');
  const { user } = useAuth();
  const { acceptInvite } = useFriends();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [inviter, setInviter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !code) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const invite = await getDoc(doc(db, FRIEND_INVITES_COLLECTION, code));
        const inviterId = invite.data()?.userId as string | undefined;
        if (inviterId) {
          const profile = await getDoc(doc(db, PROFILES_COLLECTION, inviterId));
          setInviter((profile.data()?.displayName as string | undefined)?.trim() || 'A friend');
        }
      } catch (e) {
        console.warn('[friend invite] lookup failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, code]);

  async function accept() {
    setBusy(true);
    const r = await acceptInvite(code);
    setBusy(false);
    setResult(ACCEPT_MESSAGES[r]);
  }

  let body: React.ReactNode;
  if (!user) {
    body = <ThemedText style={styles.text}>Sign in first, then open the invite link again.</ThemedText>;
  } else if (loading) {
    body = <ActivityIndicator color={colors.tint} />;
  } else if (result) {
    body = <ThemedText style={styles.text}>{result}</ThemedText>;
  } else if (!inviter) {
    body = <ThemedText style={styles.text}>{ACCEPT_MESSAGES.invalid}</ThemedText>;
  } else {
    body = (
      <>
        <ThemedText style={styles.title}>{`${inviter} wants to share chores with you`}</ThemedText>
        <ThemedText style={styles.text}>
          Chores you share, either of you can mark done. You both see how long it&apos;s been.
        </ThemedText>
        <Pressable
          style={[styles.primary, { backgroundColor: colors.tint }, busy && styles.dim]}
          onPress={() => void accept()}
          disabled={busy}
          accessibilityRole="button"
        >
          <ThemedText style={styles.primaryText}>Accept</ThemedText>
        </Pressable>
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.navHeader}>
          <Pressable onPress={() => router.replace('/(tabs)/(chores)')} hitSlop={8}>
            <ThemedText style={[styles.navButton, { color: colors.tint }]}>{result ? 'Done' : 'Not now'}</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
      <View style={styles.content}>{body}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navHeader: { paddingHorizontal: 16, paddingVertical: 12 },
  navButton: { fontSize: 16, fontWeight: '600' },
  content: { padding: 24, gap: 14 },
  title: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  text: { fontSize: 16, lineHeight: 22, opacity: 0.8 },
  primary: { marginTop: 8, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.5 },
});
