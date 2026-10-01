import { Stack } from 'expo-router';

export default function ChoresLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
