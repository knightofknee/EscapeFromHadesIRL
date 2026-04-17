import { Stack } from 'expo-router';

export default function NotesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
      <Stack.Screen name="export" options={{ title: 'Export Notes', presentation: 'modal' }} />
    </Stack>
  );
}
