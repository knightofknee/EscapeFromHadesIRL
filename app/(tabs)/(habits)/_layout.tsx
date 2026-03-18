import { Stack } from 'expo-router';

export default function HabitsLayout() {
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
