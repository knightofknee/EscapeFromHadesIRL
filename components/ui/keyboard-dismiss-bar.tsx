import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Bar height; screens pad their keyboard-aware scroll by this so content clears it. */
export const KEYBOARD_DISMISS_BAR_HEIGHT = 40;

/**
 * Bar riding on top of the keyboard with a dismiss button at the right, the
 * same one the notes screens use. Render it last inside a full-screen
 * container with nothing below it (no tab bar), e.g. a modal screen.
 */
export function KeyboardDismissBar() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const { height: kbHeight, progress } = useReanimatedKeyboardAnimation();

  // Hidden just below the bottom edge; slides up with the keyboard.
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: KEYBOARD_DISMISS_BAR_HEIGHT * (1 - progress.value) + kbHeight.value }],
  }));

  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.tileBorder }, barStyle]}
    >
      <View style={styles.spacer} />
      <Pressable
        onPress={Keyboard.dismiss}
        style={styles.button}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Hide keyboard"
      >
        <IconSymbol name="keyboard.chevron.compact.down" size={22} color={colors.icon} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: KEYBOARD_DISMISS_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  spacer: { flex: 1 },
  button: { paddingHorizontal: 8, paddingVertical: 4 },
});
