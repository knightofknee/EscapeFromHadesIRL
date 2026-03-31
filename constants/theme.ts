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

// Quest tab — Hades underworld palette, always dark
export const QuestColors = {
  background: '#0D0D1A',
  surface: '#16162A',
  border: '#2A2A45',
  text: '#E8E6F0',
  textDim: '#8884A8',
  // Flame gradient endpoints
  flameHigh: '#FF6E3A',  // bright orange — high score
  flameMid: '#E74C3C',   // red — mid score
  flameLow: '#7B1A1A',   // deep dark red — low score
  // Gold for top scores / foundation bonus
  gold: '#D4AC0D',
  goldDim: '#5C4A00',
  // Category accents
  physical: '#E74C3C',
  mental: '#5B8DD9',
  creative: '#9B59B6',
  wellness: '#27AE60',
  custom: '#7F8C8D',
  // Reduce quest (bad habit suppression)
  reduce: '#F39C12',
  // Foundation badge
  foundationActive: '#D4AC0D',
  foundationInactive: '#2A2A45',
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
