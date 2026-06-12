import { Stack } from 'expo-router';

export default function HabitsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'none',
        // The home grid stays mounted under pushed week/month/stats — freeze
        // blurred stack screens instead of re-rendering them on every record
        // write.
        freezeOnBlur: true,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Back' }} />
      <Stack.Screen name="week" />
      <Stack.Screen name="month" />
      <Stack.Screen name="stats" options={{ headerShown: true, title: 'Statistics' }} />
    </Stack>
  );
}
