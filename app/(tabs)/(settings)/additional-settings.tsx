import { StyleSheet, ScrollView, View, Pressable, Alert, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackButton } from '@/components/ui/back-button';
import { useAuth } from '@/contexts/auth-context';
import {
  signOut,
  primaryProviderId,
  reauthenticateWithPassword,
  reauthenticateWithGoogleToken,
  reauthenticateWithAppleToken,
} from '@/lib/firebase/auth';
import { deleteAccountAndData } from '@/lib/firebase/account-deletion';
import { generateNonce, sha256 } from '@/lib/crypto-nonce';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_CLIENT_ID } from '@/constants/google-oauth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

WebBrowser.maybeCompleteAuthSession();

const PRIVACY_POLICY_URL = 'https://www.waldgrave.com/escapefromhadesirl/privacy';
const TERMS_OF_SERVICE_URL = 'https://www.waldgrave.com/escapefromhadesirl/terms';

export default function AdditionalSettingsScreen() {
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Google reauth re-runs the same id-token flow the sign-in screen uses.
  const [, , promptGoogle] = useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    clientId: GOOGLE_CLIENT_ID,
  });

  // Reauthenticate right before a destructive account action. `deleteUser`
  // requires a recent login; without this, data could be deleted and then
  // the auth deletion rejected — leaving a dangling, dataless account.
  // Returns true only if reauth actually succeeded.
  async function reauthenticate(): Promise<boolean> {
    if (!user) return false;
    const provider = primaryProviderId(user);

    if (provider === 'google.com') {
      const res = await promptGoogle();
      if (res?.type === 'success' && res.params.id_token) {
        await reauthenticateWithGoogleToken(user, res.params.id_token);
        return true;
      }
      return false;
    }

    if (provider === 'apple.com') {
      const rawNonce = await generateNonce();
      const hashedNonce = await sha256(rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (credential.identityToken) {
        await reauthenticateWithAppleToken(user, credential.identityToken, rawNonce);
        return true;
      }
      return false;
    }

    // Email/password. Alert.prompt is iOS-only (same constraint the existing
    // forgot-password flow has); on Android we fall through and let the
    // requires-recent-login error guide the user to re-login.
    if (Platform.OS === 'ios') {
      return new Promise<boolean>((resolve) => {
        Alert.prompt(
          'Confirm Password',
          'Re-enter your password to permanently delete your account.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Confirm',
              style: 'destructive',
              onPress: async (pw?: string) => {
                try {
                  await reauthenticateWithPassword(user, pw ?? '');
                  resolve(true);
                } catch {
                  Alert.alert('Incorrect Password', 'Could not verify your password.');
                  resolve(false);
                }
              },
            },
          ],
          'secure-text',
        );
      });
    }
    return false;
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            try {
              const reauthed = await reauthenticate();
              if (!reauthed) return; // cancelled or failed (already surfaced)
              await deleteAccountAndData(user);
              await signOut();
              router.replace('/(auth)/sign-in');
            } catch (error: any) {
              if (error?.code === 'auth/requires-recent-login') {
                Alert.alert(
                  'Session Expired',
                  'For security, please sign out and sign back in, then try again.',
                );
              } else if (error?.code === 'account/auth-delete-failed') {
                // Data is already gone — don't leave the user in an emptied,
                // still-authenticated app. Sign out and explain the retry path.
                await signOut().catch(() => {});
                router.replace('/(auth)/sign-in');
                Alert.alert(
                  'Account Data Deleted',
                  'Your data was deleted and you have been signed out. We could not fully close your account — sign in and tap Delete Account again to finish.',
                );
              } else {
                Alert.alert('Error', 'Failed to delete account. Please try again.');
              }
            }
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <BackButton />
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Legal */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Legal
        </ThemedText>
        <View style={[styles.card, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
          <Pressable
            style={styles.row}
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          >
            <ThemedText style={styles.label}>Privacy Policy</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}
          >
            <ThemedText style={styles.label}>Terms of Service</ThemedText>
            <ThemedText style={styles.chevron}>›</ThemedText>
          </Pressable>
        </View>

        {/* Danger Zone */}
        <ThemedText type="defaultSemiBold" style={styles.sectionHeader}>
          Danger Zone
        </ThemedText>
        <Pressable
          style={[styles.deleteButton, { borderColor: '#E74C3C' }]}
          onPress={handleDeleteAccount}
        >
          <ThemedText style={styles.deleteText}>Delete Account</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
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
  chevron: { fontSize: 20, opacity: 0.3, fontWeight: '300' },
  deleteButton: {
    marginTop: 24,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteText: { color: '#E74C3C', fontWeight: '600', fontSize: 16 },
});
