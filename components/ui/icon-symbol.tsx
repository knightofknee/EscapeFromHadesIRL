// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 *
 * Every SF name used anywhere in the app MUST have an entry — `satisfies`
 * checks both sides are real icon names, and `IconSymbolName` restricts
 * call sites to mapped names so a missing mapping fails to compile instead
 * of rendering a blank Material icon on Android/web.
 */
const MAPPING = {
  'chevron.left': 'chevron-left',
  'arrow.uturn.backward': 'undo',
  'arrow.uturn.forward': 'redo',
  bookmark: 'bookmark-border',
  'bookmark.fill': 'bookmark',
  'checkmark.square.fill': 'check-box',
  'doc.text.fill': 'description',
  'gearshape.fill': 'settings',
  'keyboard.chevron.compact.down': 'keyboard-hide',
  'questionmark.circle': 'help-outline',
  strikethrough: 'format-strikethrough',
  'list.bullet': 'format-list-bulleted',
  'list.number': 'format-list-numbered',
} satisfies Partial<
  // SDK 56's SymbolViewProps['name'] is a union that includes a per-platform
  // object form — only the plain SF-name strings can key this map.
  Record<Extract<SymbolViewProps['name'], string>, ComponentProps<typeof MaterialIcons>['name']>
>;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
