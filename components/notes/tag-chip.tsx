import { StyleSheet, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type TagChipProps = {
  name: string;
  color?: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  small?: boolean;
  /** Tight line height, for display-only chips in dense lists. */
  dense?: boolean;
};

export function TagChip({ name, color, selected, onPress, onLongPress, small, dense }: TagChipProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Pressable
      style={[
        styles.chip,
        small && styles.chipSmall,
        {
          backgroundColor: selected ? (color ?? colors.tint) : colors.tagBackground,
          borderColor: color ?? colors.tint,
          borderWidth: selected ? 0 : 1,
        },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <ThemedText
        style={[
          styles.label,
          small && styles.labelSmall,
          dense && styles.labelDense,
          { color: selected ? '#fff' : (color ?? colors.tagText) },
        ]}
      >
        {name}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
  labelSmall: {
    fontSize: 11,
  },
  // ThemedText's default 24pt line height makes a chip about twice as tall
  // as its text; dense lists (the notes list) tighten it.
  labelDense: {
    lineHeight: 15,
  },
});
