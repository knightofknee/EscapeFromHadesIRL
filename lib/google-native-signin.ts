/**
 * Native Google sign-in, Android only. Google blocks the browser-redirect
 * flow (expo-auth-session) for new Android OAuth clients, so Android uses the
 * native account picker from @react-native-google-signin/google-signin, the
 * same library BeKin ships on Play. iOS keeps the expo-auth-session flow.
 *
 * PLATFORM-SPLIT like lib/steps-health: `.android.ts` imports the native
 * module; this bare file is the no-op stub every other platform resolves, so
 * an iOS build never loads a native module it doesn't need. Keep the
 * signatures of both files in lockstep.
 */

/** True where getGoogleIdTokenNative() is the Google flow to use. */
export const USE_NATIVE_GOOGLE_SIGN_IN = false;

/** Opens the native account picker. Resolves the ID token, or null if cancelled. */
export async function getGoogleIdTokenNative(): Promise<string | null> {
  throw new Error('Native Google sign-in is only used on Android');
}

/** Forget the chosen Google account so the next sign-in shows the picker. */
export async function signOutGoogleNative(): Promise<void> {}
