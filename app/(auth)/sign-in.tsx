import { useState, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import { AuthForm } from '@/components/auth/auth-form';
import { signIn, signInWithGoogle, signInWithApple, sendPasswordReset, getAuthErrorMessage } from '@/lib/firebase/auth';
import { generateNonce, sha256 } from '@/lib/crypto-nonce';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_CLIENT_ID } from '@/constants/google-oauth';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const [error, setError] = useState('');

  const [googleRequest, googleResponse, promptGoogle] = useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    clientId: GOOGLE_CLIENT_ID,
  });

  // Handle Google response when it comes back
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        signInWithGoogle(idToken)
          .then(() => router.replace('/(tabs)/(habits)'))
          .catch((e: any) => setError(getAuthErrorMessage(e)));
      }
    } else if (googleResponse?.type === 'error') {
      setError(getAuthErrorMessage(googleResponse.error));
    }
  }, [googleResponse]);

  async function handleSignIn(email: string, password: string) {
    try {
      setError('');
      await signIn(email, password);
      router.replace('/(tabs)/(habits)');
    } catch (e: any) {
      setError(getAuthErrorMessage(e));
    }
  }

  function handleForgotPassword() {
    Alert.prompt(
      'Reset Password',
      'Enter your email address and we\'ll send you a reset link.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async (emailInput: string | undefined) => {
            if (!emailInput) return;
            try {
              await sendPasswordReset(emailInput);
            } catch (e: any) {
              // Don't reveal whether the address is registered (account
              // enumeration). Surface genuine problems (bad format, network),
              // but treat "user not found" as the same neutral outcome.
              if (e?.code !== 'auth/user-not-found') {
                Alert.alert('Error', getAuthErrorMessage(e));
                return;
              }
            }
            Alert.alert(
              'Check your email',
              'If an account exists for that address, a password reset link has been sent.',
            );
          },
        },
      ],
      'plain-text',
      '', // User enters their email
    );
  }

  async function handleGoogleSignIn() {
    setError('');
    await promptGoogle();
  }

  async function handleAppleSignIn() {
    try {
      setError('');

      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        setError('Apple sign-in is not available on this device');
        return;
      }

      // Cryptographically-random nonce — Apple uses it for replay
      // protection, so it must not be predictable (was Math.random).
      const nonce = await generateNonce();
      const hashedNonce = await sha256(nonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (credential.identityToken) {
        await signInWithApple(credential.identityToken, nonce);
        router.replace('/(tabs)/(habits)');
      } else {
        setError('Apple sign-in failed: no identity token');
      }
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') return;
      setError(getAuthErrorMessage(e));
    }
  }

  return (
    <AuthForm
      mode="sign-in"
      onSubmit={handleSignIn}
      onGoogleSignIn={handleGoogleSignIn}
      googleReady={!!googleRequest}
      onAppleSignIn={Platform.OS === 'ios' ? handleAppleSignIn : undefined}
      onToggleMode={() => router.push('/(auth)/sign-up')}
      onForgotPassword={handleForgotPassword}
      error={error}
    />
  );
}
