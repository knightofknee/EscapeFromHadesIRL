import { Stack } from 'expo-router';

export default function NotesLayout() {
  return (
    <Stack screenOptions={{ freezeOnBlur: true }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
