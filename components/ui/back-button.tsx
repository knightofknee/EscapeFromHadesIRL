import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { IconSymbol } from './icon-symbol';

type Props = {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

// Mirrors the iOS back-button "pill" that the native header used to draw around
// chevron + "Settings". With the label removed the pill becomes a circle.
// Colors are fixed (not theme-dependent) so it doesn't flash with the
// async-loaded appearance preference.
export function BackButton({ onPress, style }: Props) {
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => [
        styles.button,
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      <IconSymbol name="chevron.left" size={16} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // Transparent fill, hairline low-opacity white ring (hairlineWidth is
    // already the minimum renderable thickness — softening via alpha).
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
});
