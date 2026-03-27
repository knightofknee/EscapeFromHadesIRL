import { useState } from 'react';
import { router } from 'expo-router';
import { AuthForm } from '@/components/auth/auth-form';
import { signUp, getAuthErrorMessage } from '@/lib/firebase/auth';

export default function SignUpScreen() {
  const [error, setError] = useState('');

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
      onToggleMode={() => router.back()}
      error={error}
    />
  );
}
