import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        // `Platform.OS === 'ios'` lets TS narrow Platform to the iOS
        // shape, which is the only one that exposes `isPad`. Using
        // `process.env.EXPO_OS` (the previous code) doesn't narrow, so
        // `Platform.isPad` raised a typecheck error.
        // iPad is already banned via app.json `supportsTablet: false`,
        // so the !isPad branch is a paranoia guard for if that flag
        // ever gets flipped back on.
        if (Platform.OS === 'ios' && !Platform.isPad) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
