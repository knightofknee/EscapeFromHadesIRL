import {
  initializeAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import { app } from './app';

// Use browserLocalPersistence which works in React Native via AsyncStorage polyfill.
// Firebase v12 removed getReactNativePersistence from public exports.
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
});

export function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signUp(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signOut() {
  return firebaseSignOut(auth);
}

export function onAuthChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export function signInWithGoogle(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export function signInWithApple(idToken: string, nonce: string) {
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({ idToken, rawNonce: nonce });
  return signInWithCredential(auth, credential);
}
