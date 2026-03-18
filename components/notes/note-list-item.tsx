import { useRef } from 'react';
import { StyleSheet, Pressable, View, Alert, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Note, Tag } from '@/types/note';

type NoteListItemProps = {
  note: Note;
  tags: Tag[];
  onPress: () => void;
  onDelete?: (noteId: string) => void;
};

export function NoteListItem({ note, tags, onPress, onDelete }: NoteListItemProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const swipeableRef = useRef<Swipeable>(null);

  const noteTags = note.tags
    .map((it) => tags.find((t) => t.id === it.tagId))
    .filter(Boolean) as Tag[];

  const uniqueTags = [...new Map(noteTags.map((t) => [t.id, t])).values()];

  const preview = note.content.split('\n')[0]?.slice(0, 100) || 'Empty note';
  const dateStr = new Date(note.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const handleDelete = () => {
    Alert.alert('Delete Note', `Delete "${note.title || 'Untitled'}"?`, [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => swipeableRef.current?.close(),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete?.(note.id),
      },
    ]);
  };

  const renderRightActions = (_progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });

    return (
      <Pressable onPress={handleDelete} style={styles.deleteAction}>
        <Animated.View style={[styles.deleteInner, { transform: [{ scale }] }]}>
          <ThemedText style={styles.deleteIcon}>🗑️</ThemedText>
          <ThemedText style={styles.deleteText}>Delete</ThemedText>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <Pressable
        style={[styles.container, { backgroundColor: colors.noteBackground, borderColor: colors.noteBorder }]}
        onPress={onPress}
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
    </Swipeable>
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
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    backgroundColor: '#dc3545',
    borderRadius: 8,
    marginLeft: 8,
  },
  deleteInner: {
    alignItems: 'center',
    gap: 2,
  },
  deleteIcon: {
    fontSize: 20,
  },
  deleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
