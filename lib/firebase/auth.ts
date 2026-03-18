import {
  initializeAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  type User,
  type Persistence,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { app } from './app';

// Metro resolves @firebase/auth with the "react-native" condition, which exports
// getReactNativePersistence. TypeScript can't see it because TSC uses the default
// condition. We import it at runtime where Metro resolves correctly.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getReactNativePersistence } = require('@firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
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
