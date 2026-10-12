import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { AuthForm } from '@/components/auth/auth-form';
import { ThemedText } from '@/components/themed-text';
import { signIn, sendPasswordReset, getAuthErrorMessage } from '@/lib/firebase/auth';
import { useSsoAuth } from '@/hooks/use-sso-auth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SignInScreen() {
  const [error, setError] = useState('');
  const { googleReady, handleGoogleSignIn, handleAppleSignIn } = useSsoAuth(setError);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Android reset-email modal (Alert.prompt is iOS-only, so on Android the
  // Forgot password link used to do nothing).
  const [resetVisible, setResetVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  async function handleSignIn(email: string, password: string) {
    try {
      setError('');
      await signIn(email, password);
      router.replace('/(tabs)/(habits)');
    } catch (e: unknown) {
      setError(getAuthErrorMessage(e));
    }
  }

  async function sendReset(emailInput: string | undefined) {
    const email = emailInput?.trim();
    if (!email) return;
    try {
      await sendPasswordReset(email);
    } catch (e: unknown) {
      // Don't reveal whether the address is registered (account
      // enumeration). Surface genuine problems (bad format, network),
      // but treat "user not found" as the same neutral outcome.
      if ((e as { code?: string })?.code !== 'auth/user-not-found') {
        Alert.alert('Error', getAuthErrorMessage(e));
        return;
      }
    }
    Alert.alert(
      'Check your email',
      'If an account exists for that address, a password reset link has been sent.',
    );
  }

  function handleForgotPassword() {
    if (Platform.OS !== 'ios') {
      setResetEmail('');
      setResetVisible(true);
      return;
    }
    Alert.prompt(
      'Reset Password',
      'Enter your email address and we\'ll send you a reset link.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: (emailInput: string | undefined) => void sendReset(emailInput) },
      ],
      'plain-text',
      '', // User enters their email
    );
  }

  function closeReset(send: boolean) {
    setResetVisible(false);
    if (send) void sendReset(resetEmail);
  }

  return (
    <>
      <AuthForm
        mode="sign-in"
        onSubmit={handleSignIn}
        onGoogleSignIn={handleGoogleSignIn}
        googleReady={googleReady}
        onAppleSignIn={handleAppleSignIn}
        onToggleMode={() => router.push('/(auth)/sign-up')}
        onForgotPassword={handleForgotPassword}
        error={error}
      />

      {/* Android reset-email prompt (iOS uses the native Alert.prompt). */}
      <Modal
        visible={resetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => closeReset(false)}
      >
        <Pressable style={styles.overlay} onPress={() => closeReset(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.tileBackground }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ThemedText type="defaultSemiBold" style={styles.title}>Reset Password</ThemedText>
            <ThemedText style={styles.body}>
              Enter your email address and we&apos;ll send you a reset link.
            </ThemedText>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
              value={resetEmail}
              onChangeText={setResetEmail}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              placeholder="you@example.com"
              placeholderTextColor={colors.icon}
              returnKeyType="send"
              onSubmitEditing={() => resetEmail.trim() && closeReset(true)}
            />
            <View style={styles.buttons}>
              <Pressable style={styles.cancel} onPress={() => closeReset(false)}>
                <ThemedText style={styles.cancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.send, { backgroundColor: colors.tint, opacity: resetEmail.trim() ? 1 : 0.5 }]}
                disabled={!resetEmail.trim()}
                onPress={() => closeReset(true)}
              >
                <ThemedText style={styles.sendText}>Send</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 24,
  },
  sheet: { width: '100%', maxWidth: 360, borderRadius: 12, padding: 20, gap: 12 },
  title: { fontSize: 16, textAlign: 'center' },
  body: { fontSize: 13, textAlign: 'center', opacity: 0.8, lineHeight: 18 },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  buttons: { flexDirection: 'row', gap: 12 },
  cancel: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  cancelText: { fontWeight: '600' },
  send: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
});
