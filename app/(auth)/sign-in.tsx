import { useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { AuthForm } from '@/components/auth/auth-form';
import { signIn, sendPasswordReset, getAuthErrorMessage } from '@/lib/firebase/auth';
import { useSsoAuth } from '@/hooks/use-sso-auth';

export default function SignInScreen() {
  const [error, setError] = useState('');
  const { googleReady, handleGoogleSignIn, handleAppleSignIn } = useSsoAuth(setError);

  async function handleSignIn(email: string, password: string) {
    try {
      setError('');
      await signIn(email, password);
      router.replace('/(tabs)/(habits)');
    } catch (e: unknown) {
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
          },
        },
      ],
      'plain-text',
      '', // User enters their email
    );
  }

  return (
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
  );
}
