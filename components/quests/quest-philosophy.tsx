import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { QuestColors } from '@/constants/theme';

type Props = {
  text: string;
};

/**
 * Expandable "why this quest" section — the philosophy and inspiration
 * behind a quest. Collapsed by default so the screen stays scannable;
 * the chevron header toggles it open.
 */
export function QuestPhilosophy({ text }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse quest philosophy' : 'Expand quest philosophy'}
      >
        <ThemedText style={styles.label}>WHY THIS QUEST</ThemedText>
        <ThemedText style={styles.chevron}>{expanded ? '▾' : '▸'}</ThemedText>
      </Pressable>
      {expanded && <ThemedText style={styles.body}>{text}</ThemedText>}
    </View>
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
});
