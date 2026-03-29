import { Platform } from 'react-native';

const tintColorLight = '#E74C3C';
const tintColorDark = '#EF5350';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    // Habit grid
    gridBackground: '#F0F2F5',
    tileBackground: '#FFFFFF',
    tileBorder: '#E1E4E8',
    tileRecorded: '#2ECC71',
    tileUnrecorded: '#D5D8DC',
    tileDouble: '#F1C40F',
    // Notes
    noteBackground: '#FFFFFF',
    noteBorder: '#E1E4E8',
    tagBackground: '#FDEDEC',
    tagText: '#E74C3C',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    // Habit grid
    gridBackground: '#1C1E21',
    tileBackground: '#2C2F33',
    tileBorder: '#3A3D42',
    tileRecorded: '#27AE60',
    tileUnrecorded: '#4A4D52',
    tileDouble: '#D4AC0D',
    // Notes
    noteBackground: '#2C2F33',
    noteBorder: '#3A3D42',
    tagBackground: '#3B1A1A',
    tagText: '#EF5350',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
