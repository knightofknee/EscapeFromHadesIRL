import { useState } from 'react';
import { router } from 'expo-router';
import { AuthForm } from '@/components/auth/auth-form';
import { signUp, getAuthErrorMessage } from '@/lib/firebase/auth';
import { useSsoAuth } from '@/hooks/use-sso-auth';

export default function SignUpScreen() {
  const [error, setError] = useState('');
  const { googleReady, handleGoogleSignIn, handleAppleSignIn } = useSsoAuth(setError);

  async function handleSignUp(email: string, password: string) {
    try {
      setError('');
      await signUp(email, password);
      router.replace('/(tabs)/(habits)');
    } catch (e: any) {
      setError(getAuthErrorMessage(e));
    }
  }

  return (
    <AuthForm
      mode="sign-up"
      onSubmit={handleSignUp}
      onGoogleSignIn={handleGoogleSignIn}
      googleReady={googleReady}
      onAppleSignIn={handleAppleSignIn}
      onToggleMode={() => router.back()}
      error={error}
    />
  );
}
