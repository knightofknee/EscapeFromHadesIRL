import { Stack } from 'expo-router';

export default function NotesLayout() {
  return (
    <Stack screenOptions={{ freezeOnBlur: true }}>
      {/* The editor's back button uses router.dismissTo — a real pop when the
          list is in the stack. animationTypeForReplace covers the fallback
          path only: dismissTo degrades to replace after a deep link / cold
          start where the list was never mounted, and a replace animates like
          a forward push by default; 'pop' keeps that edge sliding right too. */}
      <Stack.Screen
        name="index"
        options={{ headerShown: false, animationTypeForReplace: 'pop' }}
      />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
