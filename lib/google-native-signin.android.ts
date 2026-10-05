import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { GOOGLE_CLIENT_ID } from '@/constants/google-oauth';

// See lib/google-native-signin.ts for why this exists. The WEB client ID is
// what makes Google mint an ID token Firebase accepts; the Android OAuth
// client (package name + signing SHA-1, registered in the Firebase/Google
// Cloud project) is matched automatically and never referenced in code.

export const USE_NATIVE_GOOGLE_SIGN_IN = true;

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: GOOGLE_CLIENT_ID });
  configured = true;
}

export async function getGoogleIdTokenNative(): Promise<string | null> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  try {
    const result = await GoogleSignin.signIn();
    // v13+ resolves a dismissed picker as { type: 'cancelled' } instead of rejecting.
    if (result.type === 'cancelled') return null;
    const idToken = result.data.idToken;
    if (!idToken) throw new Error('Google sign-in returned no ID token');
    return idToken;
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw e;
  }
}

export async function signOutGoogleNative(): Promise<void> {
  try {
    ensureConfigured();
    await GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or Play Services missing: nothing to forget.
  }
}
