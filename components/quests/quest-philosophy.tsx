import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { QuestColors } from '@/constants/theme';

type Props = {
  text: string;
};

/**
 * Expandable "why this quest" section. Collapsed shows a 2-line TEASER of the
 * philosophy + a "Read more" — so it's clear there's more to open (a bare
 * chevron hid that entirely). The whole card toggles.
 */
export function QuestPhilosophy({ text }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      style={styles.card}
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Collapse quest philosophy' : 'Expand quest philosophy'}
    >
      <View style={styles.header}>
        <ThemedText style={styles.label}>WHY THIS QUEST</ThemedText>
        <ThemedText style={styles.chevron}>{expanded ? '▾' : '▸'}</ThemedText>
      </View>
      <ThemedText style={styles.body} numberOfLines={expanded ? undefined : 2}>
        {text}
      </ThemedText>
      <ThemedText style={styles.more}>{expanded ? 'Show less' : 'Read more'}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: QuestColors.surface,
    borderWidth: 1,
    borderColor: QuestColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: QuestColors.textDim,
    letterSpacing: 1.5,
  },
  chevron: {
    fontSize: 13,
    color: QuestColors.textDim,
  },
  body: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: QuestColors.text,
  },
  more: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: QuestColors.flameHigh,
    letterSpacing: 0.3,
  },
});
