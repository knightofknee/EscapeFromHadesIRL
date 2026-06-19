import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
// Theme symbols come from expo-router (it vendors react-navigation as of
// SDK 56) — the @react-navigation/native copies would feed a theme context
// the vendored navigators never read.
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import 'react-native-reanimated';
import * as Notifications from 'expo-notifications';

// Set the notification handler ONCE at app startup so that meditation-timer
// completion notifications still play the default sound + show a banner
// when the app is in the foreground. Without this, iOS silently swallows
// notifications that fire while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // The meditation completion alarm rings in-app (looping bell + takeover)
    // when foregrounded, so mute its notification sound here to avoid playing
    // both at once. The banner still shows. This handler only runs in the
    // foreground; backgrounded/locked delivery keeps the alarm sound.
    const isMeditationAlarm =
      notification.request.content.data?.kind === 'meditation-alarm';
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: !isMeditationAlarm,
      shouldSetBadge: false,
    };
  },
});

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { OfflineProvider } from '@/contexts/offline-context';
import { AppDataProviders } from '@/contexts/app-data-providers';
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
    // Awaited: if the write rejects (rules/network), fall back to the notes
    // list instead of routing into a note that doesn't exist. Offline, a
    // Firestore write promise never settles (it only resolves on server
    // ack), so race a timeout — the user must not hang on the splash, and a
    // late ack must not yank them into an empty note minutes into a session.
    const created = await Promise.race([
      setDoc(ref, {
        id: ref.id,
        userId,
        title: '',
        content: '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      }).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
    ]);
    replace(created ? `/(tabs)/(notes)/${ref.id}?new=1` : '/(tabs)/(notes)');
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
      {/* Custom in-screen header (no native bar): iOS 26 wraps native bar
          buttons in glass capsules we can't opt out of, so the screen draws
          its own plain-text Cancel/Save row. */}
      <Stack.Screen name="tile-settings" options={{ presentation: 'modal', headerShown: false }} />
      {/* Draws its own back-row header (same iOS 26 capsule reason as
          tile-settings) — without this entry it gets a default native bar
          titled "revive-habit" stacked above its own. */}
      <Stack.Screen name="revive-habit" options={{ presentation: 'modal', headerShown: false }} />
      <Stack.Screen name="export-notes" options={{ presentation: 'modal', title: 'Export Notes' }} />
    </Stack>
  );
}

export default function RootLayout() {
  // useColorScheme already folds the stored appearance preference together
  // with the system scheme (including legacy 'system' values) — every
  // component resolves through it, so the navigation theme and root status
  // bar must too, or a 'system' preference renders light components inside
  // a dark nav theme.
  const effectiveScheme = useColorScheme() ?? 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthProvider>
          <OfflineProvider>
            <AppDataProviders>
              <ThemeProvider value={effectiveScheme === 'dark' ? DarkTheme : DefaultTheme}>
                <RootNavigator />
                <StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
              </ThemeProvider>
            </AppDataProviders>
          </OfflineProvider>
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
