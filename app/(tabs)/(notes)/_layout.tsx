import { Stack } from 'expo-router';

export default function NotesLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Notes' }} />
      <Stack.Screen name="[id]" options={{ title: 'Note' }} />
      <Stack.Screen name="export" options={{ title: 'Export Notes', presentation: 'modal' }} />
    </Stack>
  );
}
