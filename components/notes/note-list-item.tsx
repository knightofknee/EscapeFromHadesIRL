import { StyleSheet, Pressable, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Note, Tag } from '@/types/note';

type NoteListItemProps = {
  note: Note;
  tags: Tag[];
  onPress: () => void;
  onLongPress?: () => void;
};

export function NoteListItem({ note, tags, onPress, onLongPress }: NoteListItemProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const noteTags = note.tags
    .map((it) => tags.find((t) => t.id === it.tagId))
    .filter(Boolean) as Tag[];

  const uniqueTags = [...new Map(noteTags.map((t) => [t.id, t])).values()];

  const preview = note.content.split('\n')[0]?.slice(0, 100) || 'Empty note';
  const dateStr = new Date(note.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Pressable
      style={[styles.container, { backgroundColor: colors.noteBackground, borderColor: colors.noteBorder }]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.header}>
        <ThemedText type="defaultSemiBold" style={styles.title} numberOfLines={1}>
          {note.title || 'Untitled'}
        </ThemedText>
        <ThemedText style={styles.date}>{dateStr}</ThemedText>
      </View>
      <ThemedText style={styles.preview} numberOfLines={2}>
        {preview}
      </ThemedText>
      {uniqueTags.length > 0 && (
        <View style={styles.tags}>
          {uniqueTags.slice(0, 5).map((tag) => (
            <TagChip key={tag.id} name={tag.name} color={tag.color} small />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    flex: 1,
  },
  date: {
    fontSize: 12,
    opacity: 0.5,
    marginLeft: 8,
  },
  preview: {
    fontSize: 13,
    opacity: 0.6,
    lineHeight: 18,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
});
