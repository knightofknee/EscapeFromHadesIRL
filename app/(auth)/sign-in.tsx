import { useState, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import { AuthForm } from '@/components/auth/auth-form';
import { signIn, signInWithGoogle, signInWithApple, sendPasswordReset } from '@/lib/firebase/auth';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const [error, setError] = useState('');

  const [googleRequest, googleResponse, promptGoogle] = useIdTokenAuthRequest({
    iosClientId: '844071641525-l1v60tmbhjgsn0d5umogslp7r4ohbp9g.apps.googleusercontent.com',
    clientId: '844071641525-gevfkii274b28110sib5pu16c80tm966.apps.googleusercontent.com',
  });

  // Handle Google response when it comes back
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params.id_token;
      if (idToken) {
        signInWithGoogle(idToken)
          .then(() => router.replace('/(tabs)/(habits)'))
          .catch((e: any) => setError(e.message ?? 'Google sign-in failed'));
      }
    } else if (googleResponse?.type === 'error') {
      setError(googleResponse.error?.message ?? 'Google sign-in failed');
    }
  }, [googleResponse]);

  async function handleSignIn(email: string, password: string) {
    try {
      setError('');
      await signIn(email, password);
      router.replace('/(tabs)/(habits)');
    } catch (e: any) {
      setError(e.message ?? 'Failed to sign in');
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
              Alert.alert('Check your email', 'A password reset link has been sent.');
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to send reset email');
            }
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
      const nonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce,
      );

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
      setError(e.message ?? 'Apple sign-in failed');
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
