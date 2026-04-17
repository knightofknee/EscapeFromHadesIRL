import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearance } from '@/hooks/use-appearance';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { getHomeScreen } from '@/hooks/use-home-screen';
import { db, collection, doc, setDoc } from '@/lib/firebase/firestore';
import type { User } from 'firebase/auth';

async function routeToHome(userId: string, replace: (href: string) => void) {
  const home = await getHomeScreen();
  if (home !== 'notes') {
    replace('/(tabs)/(habits)');
    return;
  }
  // Notes-as-home: create a fresh note on cold start (in-memory resumes preserve
  // the last screen automatically, so this only runs when the app truly restarts).
  try {
    const ref = doc(collection(db, 'notes'));
    const now = Date.now();
    setDoc(ref, {
      id: ref.id,
      userId,
      title: '',
      content: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
    replace(`/(tabs)/(notes)/${ref.id}?new=1`);
  } catch {
    replace('/(tabs)/(notes)');
  }
}

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const prevUserRef = useRef<User | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const prevUser = prevUserRef.current;
    prevUserRef.current = user;
    const justSignedIn = !prevUser && !!user;

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
      return;
    }

    // Route to home on fresh sign-in (cold start or post-auth flow)
    if (user && (justSignedIn || inAuthGroup)) {
      routeToHome(user.uid, (href) => router.replace(href as never));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable, including it causes infinite loops
  }, [user, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={loadingStyles.container}>
        <Image
          source={require('@/assets/images/splash-icon.png')}
          style={loadingStyles.logo}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="tile-settings" options={{ presentation: 'modal', title: 'Tile Settings' }} />
      <Stack.Screen name="export-notes" options={{ presentation: 'modal', title: 'Export Notes' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const systemColorScheme = useColorScheme();
  const { appearance } = useAppearance();

  const effectiveScheme = appearance === 'light' ? 'light' : 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthProvider>
          <ThemeProvider value={effectiveScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootNavigator />
            <StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
          </ThemeProvider>
        </AuthProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 180,
  },
});
