import { StyleSheet, Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type SegmentedControlProps<T extends string> = {
  segments: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  segments,
  selected,
  onSelect,
}: SegmentedControlProps<T>) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.container, { backgroundColor: colors.gridBackground }]}>
      {segments.map((seg) => (
        <Pressable
          key={seg.value}
          style={[
            styles.segment,
            selected === seg.value && {
              backgroundColor: colors.tint,
            },
          ]}
          onPress={() => onSelect(seg.value)}
        >
          <ThemedText
            style={[
              styles.label,
              { color: selected === seg.value ? '#fff' : colors.text },
            ]}
          >
            {seg.label}
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
});
