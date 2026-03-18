import { Stack } from 'expo-router';

export default function HabitsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Back' }} />
      <Stack.Screen name="week" />
      <Stack.Screen name="month" />
      <Stack.Screen name="stats" options={{ headerShown: true, title: 'Statistics' }} />
      <Stack.Screen name="import" options={{ headerShown: true, title: 'Import', presentation: 'modal' }} />
    </Stack>
  );
}
