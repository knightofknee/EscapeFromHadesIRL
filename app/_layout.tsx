import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearance } from '@/hooks/use-appearance';
import { AuthProvider, useAuth } from '@/contexts/auth-context';

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)/(habits)');
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
      <AuthProvider>
        <ThemeProvider value={effectiveScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootNavigator />
          <StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
      </AuthProvider>
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
