import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { isHexColor } from '@/constants/grid';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
  /** Current color (#RRGGBB). Seeds the field. */
  value: string;
  /** Called with an uppercase #RRGGBB as soon as the field holds six hex digits. */
  onChange: (hex: string) => void;
  autoFocus?: boolean;
};

/**
 * Inline hex color field: "#" + six hex digits, with a live swatch beside it.
 * Commits on every valid value; shorter input leaves the stored color alone.
 */
export function ColorHexField({ value, onChange, autoFocus }: Props) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [draft, setDraft] = useState(() => (isHexColor(value) ? value.slice(1).toUpperCase() : ''));
  const preview = `#${draft}`;
  const valid = isHexColor(preview);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View
          style={[
            styles.swatch,
            { borderColor: colors.tileBorder },
            valid ? { backgroundColor: preview } : { backgroundColor: colors.tileBackground },
          ]}
        />
        <View style={[styles.field, { borderColor: colors.tileBorder }]}>
          <ThemedText style={[styles.hash, { color: colors.icon }]}>#</ThemedText>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            value={draft}
            onChangeText={(t) => {
              const next = t.replace(/[^0-9a-fA-F]/g, '').toUpperCase().slice(0, 6);
              setDraft(next);
              if (next.length === 6) onChange(`#${next}`);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus={autoFocus}
            maxLength={6}
            placeholder="RRGGBB"
            placeholderTextColor={colors.icon}
            accessibilityLabel="Hex color"
          />
        </View>
      </View>
      <ThemedText style={[styles.hint, { color: colors.icon }]}>
        6 hex digits, 0-9 and A-F. Example: 1ABC9C.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    width: 150,
  },
  hash: {
    fontSize: 16,
    marginRight: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
    paddingVertical: 0,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
});
