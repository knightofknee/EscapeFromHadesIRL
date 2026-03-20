import { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  View,
  Image,
  Text,
  Keyboard,
  Animated,
  Easing,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import GoogleLogo from './google-logo';

type AuthFormProps = {
  mode: 'sign-in' | 'sign-up';
  onSubmit: (email: string, password: string) => Promise<void>;
  onGoogleSignIn?: () => Promise<void>;
  googleReady?: boolean;
  onAppleSignIn?: () => Promise<void>;
  onToggleMode: () => void;
  onForgotPassword?: () => void;
  error?: string;
};

const themes = {
  light: {
    bg: '#F0F4FF',
    text: '#1A1A2E',
    subtle: '#7A8599',
    card: '#FFFFFF',
    inputBg: '#F7F8FA',
    border: '#E2E6EE',
    primary: '#3B82F6',
    error: '#E74C3C',
    blobA: '#e2ebff',
    blobB: '#d7e4ff',
  },
  dark: {
    bg: '#0F1117',
    text: '#ECEDEE',
    subtle: '#6B7A99',
    card: '#171D2E',
    inputBg: '#1C2336',
    border: '#2A3650',
    primary: '#5BA8F5',
    error: '#E74C3C',
    blobA: '#1E2A4A',
    blobB: '#1A2744',
  },
};

const TOP_OFFSET = 140;
const BOTTOM_GAP = 28;

export function AuthForm({
  mode,
  onSubmit,
  onGoogleSignIn,
  googleReady = true,
  onAppleSignIn,
  onToggleMode,
  onForgotPassword,
  error,
}: AuthFormProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? themes.dark : themes.light;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState<'google' | 'apple' | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  const shift = useRef(new Animated.Value(0)).current;
  const cardRef = useRef<View>(null);
  const kbHeightRef = useRef(0);
  const keyboardVisibleRef = useRef(false);

  const recomputeShift = (kbHeight: number, duration?: number) => {
    const winH = Dimensions.get('window').height;
    const keyboardTop = winH - kbHeight;
    if (cardRef.current && 'measureInWindow' in cardRef.current) {
      // @ts-ignore measureInWindow exists at runtime
      cardRef.current.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        const bottom = y + h;
        const needed = Math.max(0, bottom - keyboardTop + BOTTOM_GAP);
        Animated.timing(shift, {
          toValue: -needed,
          duration: duration ?? 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    }
  };

  useEffect(() => {
    const onShow = (e: any) => {
      const kb = e?.endCoordinates?.height ?? 0;
      kbHeightRef.current = kb;
      if (keyboardVisibleRef.current) return;
      keyboardVisibleRef.current = true;
      recomputeShift(kb, e?.duration);
    };
    const onHide = (e: any) => {
      keyboardVisibleRef.current = false;
      kbHeightRef.current = 0;
      Animated.timing(shift, {
        toValue: 0,
        duration: e?.duration ?? 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    const subs = [
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillShow', onShow)
        : Keyboard.addListener('keyboardDidShow', onShow),
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillHide', onHide)
        : Keyboard.addListener('keyboardDidHide', onHide),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const anyLoading = loading || ssoLoading != null;

  async function handleSubmit() {
    if (!email || !password) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      await onSubmit(email, password);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (!onGoogleSignIn) return;
    Keyboard.dismiss();
    setSsoLoading('google');
    try {
      await onGoogleSignIn();
    } finally {
      setSsoLoading(null);
    }
  }

  async function handleApple() {
    if (!onAppleSignIn) return;
    Keyboard.dismiss();
    setSsoLoading('apple');
    try {
      await onAppleSignIn();
    } finally {
      setSsoLoading(null);
    }
  }

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.bg }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <Animated.View
            style={[
              styles.container,
              { paddingTop: TOP_OFFSET, transform: [{ translateY: shift }] },
            ]}
          >
            {/* Decorative blobs */}
            <View style={[styles.blobA, { backgroundColor: colors.blobA }]} />
            <View style={[styles.blobB, { backgroundColor: colors.blobB }]} />

            {/* Header / logo */}
            <View style={styles.header}>
              <Image
                source={require('@/assets/images/logo-transparent.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={[styles.title, { color: colors.text }]}>
                {mode === 'sign-in' ? 'Welcome back' : 'Create account'}
              </Text>
              <Text style={[styles.subtitle, { color: colors.subtle }]}>
                {mode === 'sign-in' ? 'Sign in to Escape from Hades IRL' : 'Get started with Escape from Hades IRL'}
              </Text>
            </View>

            {/* Card */}
            <View ref={cardRef} style={[styles.card, { backgroundColor: colors.card }]}>
              {/* Toggle mode */}
              <View style={styles.topRow}>
                <Text style={{ color: colors.subtle }}>
                  {mode === 'sign-in' ? 'New here?' : 'Already have an account?'}
                </Text>
                <Pressable onPress={onToggleMode}>
                  <Text style={[styles.link, { color: colors.primary }]}>
                    {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
                  </Text>
                </Pressable>
              </View>

              {/* Error */}
              {error ? (
                <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
              ) : null}

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      borderColor: emailFocused ? colors.primary : colors.border,
                      backgroundColor: colors.inputBg,
                      color: colors.text,
                    },
                  ]}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.subtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  value={email}
                  editable={!anyLoading}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  returnKeyType="next"
                />
              </View>

              {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Password</Text>
                <View
                  style={[
                    styles.input,
                    styles.inputRow,
                    {
                      borderColor: pwFocused ? colors.primary : colors.border,
                      backgroundColor: colors.inputBg,
                    },
                  ]}
                >
                  <TextInput
                    style={{ flex: 1, color: colors.text }}
                    placeholder="••••••••"
                    placeholderTextColor={colors.subtle}
                    secureTextEntry={!showPassword}
                    value={password}
                    editable={!anyLoading}
                    onChangeText={setPassword}
                    onFocus={() => setPwFocused(true)}
                    onBlur={() => setPwFocused(false)}
                    textContentType="password"
                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                  />
                  <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={10}>
                    <Text style={[styles.togglePw, { color: colors.primary }]}>
                      {showPassword ? 'Hide' : 'Show'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Submit */}
              <Pressable
                onPress={handleSubmit}
                disabled={anyLoading}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                  pressed && { opacity: 0.9 },
                  anyLoading && { opacity: 0.7 },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Enter</Text>
                )}
              </Pressable>

              {/* Forgot password */}
              {mode === 'sign-in' && onForgotPassword && (
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <Pressable onPress={onForgotPassword}>
                    <Text style={[styles.link, { color: colors.primary }]}>
                      Forgot password?
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* SSO divider */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.subtle }]}>or sign in with</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>

              {/* SSO buttons */}
              <View style={styles.ssoRow}>
                {onGoogleSignIn && (
                  <Pressable
                    onPress={handleGoogle}
                    disabled={anyLoading || !googleReady}
                    style={({ pressed }) => [
                      styles.googleBtn,
                      { borderColor: colors.border, backgroundColor: colors.inputBg },
                      pressed && { opacity: 0.85 },
                      anyLoading && { opacity: 0.7 },
                    ]}
                  >
                    {ssoLoading === 'google' ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <View style={styles.ssoBtnInner}>
                        <GoogleLogo size={22} />
                        <Text style={[styles.googleBtnText, { color: colors.text }]}>Google</Text>
                      </View>
                    )}
                  </Pressable>
                )}

                {onAppleSignIn && Platform.OS === 'ios' && (
                  <Pressable
                    onPress={handleApple}
                    disabled={anyLoading}
                    style={({ pressed }) => [
                      styles.appleBtn,
                      { backgroundColor: isDark ? '#FFFFFF' : '#000' },
                      pressed && { opacity: 0.85 },
                      anyLoading && { opacity: 0.7 },
                    ]}
                  >
                    {ssoLoading === 'apple' ? (
                      <ActivityIndicator color={isDark ? '#000' : '#FFF'} />
                    ) : (
                      <View style={styles.ssoBtnInner}>
                        <Ionicons name="logo-apple" size={22} color={isDark ? '#000' : '#FFF'} />
                        <Text style={[styles.appleBtnText, { color: isDark ? '#000' : '#FFF' }]}>
                          Apple
                        </Text>
                      </View>
                    )}
                  </Pressable>
                )}
              </View>
            </View>
          </Animated.View>
        </TouchableWithoutFeedback>

        {/* Loading overlay */}
        {anyLoading && (
          <View
            style={[
              styles.blocker,
              {
                backgroundColor: isDark
                  ? 'rgba(15,17,23,0.98)'
                  : 'rgba(255,255,255,0.98)',
              },
            ]}
            pointerEvents="auto"
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ marginTop: 8, color: colors.subtle }}>
              {ssoLoading === 'google'
                ? 'Signing in with Google\u2026'
                : ssoLoading === 'apple'
                  ? 'Signing in with Apple\u2026'
                  : 'Signing you in\u2026'}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  logo: {
    width: 84,
    height: 84,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
  },
  card: {
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 14,
  },
  link: {
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 14,
  },
  label: {
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  togglePw: {
    fontWeight: '700',
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  ssoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  googleBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ssoBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  appleBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  // Decorative blobs
  blobA: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    top: -60,
    right: -50,
  },
  blobB: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 999,
    bottom: -50,
    left: -40,
  },
  blocker: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
