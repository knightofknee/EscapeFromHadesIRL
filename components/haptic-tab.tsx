// expo-router 56 vendors react-navigation — importing from @react-navigation/*
// would create a SECOND copy whose React contexts the real navigator never
// provides. Always use expo-router's entry points for navigation symbols.
import { type BottomTabBarButtonProps } from 'expo-router/js-tabs';
// PlatformPressable is deprecated upstream ("copy into your codebase; removed
// in a future SDK") — copy it locally when the removal lands.
import { PlatformPressable } from 'expo-router/react-navigation';
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
