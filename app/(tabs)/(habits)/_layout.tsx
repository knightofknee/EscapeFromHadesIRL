import { Stack, usePathname, useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SegmentedControl } from '@/components/ui/segmented-control';

const VIEW_SEGMENTS = [
  { value: '/(tabs)/(habits)' as const, label: 'Day' },
  { value: '/(tabs)/(habits)/week' as const, label: 'Week' },
  { value: '/(tabs)/(habits)/month' as const, label: 'Month' },
];

export default function HabitsLayout() {
  const pathname = usePathname();
  const router = useRouter();

  // Determine active view from pathname
  const activeView = pathname.includes('/week')
    ? '/(tabs)/(habits)/week'
    : pathname.includes('/month')
      ? '/(tabs)/(habits)/month'
      : '/(tabs)/(habits)';

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="week" />
      <Stack.Screen name="month" />
      <Stack.Screen name="stats" options={{ headerShown: true, title: 'Statistics', presentation: 'modal' }} />
      <Stack.Screen name="import" options={{ headerShown: true, title: 'Import', presentation: 'modal' }} />
    </Stack>
  );
}
