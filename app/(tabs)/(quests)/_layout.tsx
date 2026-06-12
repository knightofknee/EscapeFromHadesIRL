import { Stack } from 'expo-router';

export default function QuestsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ presentation: 'card' }} />
    </Stack>
  );
}
