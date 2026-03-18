import { useState } from 'react';
import { StyleSheet, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type AuthFormProps = {
  mode: 'sign-in' | 'sign-up';
  onSubmit: (email: string, password: string) => Promise<void>;
  onGoogleSignIn?: () => Promise<void>;
  googleReady?: boolean;
  onAppleSignIn?: () => Promise<void>;
  onToggleMode: () => void;
  error?: string;
};

export function AuthForm({ mode, onSubmit, onGoogleSignIn, googleReady = true, onAppleSignIn, onToggleMode, error }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState<'google' | 'apple' | null>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      await onSubmit(email, password);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!onGoogleSignIn) return;
    setSsoLoading('google');
    try {
      await onGoogleSignIn();
    } finally {
      setSsoLoading(null);
    }
  }

  async function handleApple() {
    if (!onAppleSignIn) return;
    setSsoLoading('apple');
    try {
      await onAppleSignIn();
    } finally {
      setSsoLoading(null);
    }
  }

  const isDisabled = loading || ssoLoading != null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.inner}>
        <ThemedText type="title" style={styles.title}>
          {mode === 'sign-in' ? 'Welcome Back' : 'Create Account'}
        </ThemedText>

        {error ? (
          <ThemedText style={styles.error}>{error}</ThemedText>
        ) : null}

        {/* SSO Buttons */}
        <View style={styles.ssoSection}>
          {onGoogleSignIn && (
            <Pressable
              style={[styles.ssoButton, { borderColor: colors.icon }]}
              onPress={handleGoogle}
              disabled={isDisabled || !googleReady}
            >
              {ssoLoading === 'google' ? (
                <ActivityIndicator size="small" />
              ) : (
                <ThemedText style={styles.ssoText}>Continue with Google</ThemedText>
              )}
            </Pressable>
          )}

          {onAppleSignIn && Platform.OS === 'ios' && (
            <Pressable
              style={[styles.ssoButton, styles.appleButton]}
              onPress={handleApple}
              disabled={isDisabled}
            >
              {ssoLoading === 'apple' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.appleText}>Continue with Apple</ThemedText>
              )}
            </Pressable>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.icon }]} />
          <ThemedText style={[styles.dividerText, { color: colors.icon }]}>or</ThemedText>
          <View style={[styles.dividerLine, { backgroundColor: colors.icon }]} />
        </View>

        {/* Email/Password */}
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.icon }]}
          placeholder="Email"
          placeholderTextColor={colors.icon}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.icon }]}
          placeholder="Password"
          placeholderTextColor={colors.icon}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        />

        <Pressable
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={handleSubmit}
          disabled={isDisabled}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.buttonText}>
              {mode === 'sign-in' ? 'Sign In' : 'Sign Up'}
            </ThemedText>
          )}
        </Pressable>

        <Pressable onPress={onToggleMode} style={styles.toggleButton}>
          <ThemedText style={{ color: colors.tint }}>
            {mode === 'sign-in'
              ? "Don't have an account? Sign Up"
              : 'Already have an account? Sign In'}
          </ThemedText>
        </Pressable>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: {
    textAlign: 'center',
    marginBottom: 16,
  },
  ssoSection: {
    gap: 10,
  },
  ssoButton: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ssoText: {
    fontSize: 16,
    fontWeight: '500',
  },
  appleButton: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  appleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  button: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  error: {
    color: '#E74C3C',
    textAlign: 'center',
  },
});
