import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useIdTokenAuthRequest } from 'expo-auth-session/providers/google';
import { signInWithGoogle, signInWithApple, getAuthErrorMessage } from '@/lib/firebase/auth';
import { generateNonce, sha256 } from '@/lib/crypto-nonce';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_CLIENT_ID } from '@/constants/google-oauth';

WebBrowser.maybeCompleteAuthSession();

/**
 * Google + Apple SSO shared by the sign-in and sign-up screens. SSO makes the
 * account if none exists yet, so both screens get the exact same handlers -
 * the sign-up screen previously passed none and rendered an empty SSO row.
 */
export function useSsoAuth(setError: (message: string) => void) {
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
          .catch((e: unknown) => setError(getAuthErrorMessage(e)));
      }
    } else if (googleResponse?.type === 'error') {
      setError(getAuthErrorMessage(googleResponse.error));
    }
  }, [googleResponse]); // eslint-disable-line react-hooks/exhaustive-deps

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

      // Cryptographically-random nonce - Apple uses it for replay
      // protection, so it must not be predictable.
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
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      setError(getAuthErrorMessage(e));
    }
  }

  return {
    googleReady: !!googleRequest,
    handleGoogleSignIn,
    handleAppleSignIn: Platform.OS === 'ios' ? handleAppleSignIn : undefined,
  };
}
