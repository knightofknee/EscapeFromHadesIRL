import { useRef } from 'react';
import { StyleSheet, Pressable, View, Alert, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Note, Tag } from '@/types/note';

type NoteListItemProps = {
  note: Note;
  tags: Tag[];
  onPress: () => void;
  onDelete?: (noteId: string) => void;
  onTogglePin?: (noteId: string, pinned: boolean) => void;
};

export function NoteListItem({ note, tags, onPress, onDelete, onTogglePin }: NoteListItemProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const swipeableRef = useRef<Swipeable>(null);

  const noteTags = note.tags
    .map((it) => tags.find((t) => t.id === it.tagId))
    .filter(Boolean) as Tag[];

  const uniqueTags = [...new Map(noteTags.map((t) => [t.id, t])).values()];

  const hasTitle = note.title.trim().length > 0;
  const isChecklist = note.type === 'checklist';

  // Compute the preview line based on note type.
  //  text mode: Apple Notes style — first non-empty line is title (if no
  //             explicit title), next non-empty line is the preview.
  //  checklist: description if present; else first uncompleted task; if
  //             everything is done, show "✓"; if entirely empty, "Empty
  //             checklist".
  let displayTitle: string;
  let preview: string;

  if (isChecklist) {
    const desc = (note.description ?? '').trim();
    const items = note.checklist ?? [];
    const firstUncompleted = items.find((i) => !i.completed && i.text.trim().length > 0);
    const hasAnyItem = items.some((i) => i.text.trim().length > 0);
    const allDone = hasAnyItem && items.every((i) => i.completed || !i.text.trim());

    if (hasTitle) {
      displayTitle = note.title;
    } else if (desc.length > 0) {
      displayTitle = desc.split('\n')[0]!;
    } else if (firstUncompleted) {
      displayTitle = firstUncompleted.text;
    } else if (hasAnyItem) {
      displayTitle = '✓';
    } else {
      displayTitle = 'Empty checklist';
    }

    if (hasTitle) {
      // Title is the explicit one; preview is description or first task.
      if (desc.length > 0) preview = desc.split('\n')[0]!;
      else if (firstUncompleted) preview = firstUncompleted.text;
      else if (allDone) preview = '✓';
      else preview = '';
    } else {
      // displayTitle already consumed the best preview slot; secondary
      // preview line shows the next-most-relevant string, if any.
      if (desc.length > 0 && firstUncompleted) preview = firstUncompleted.text;
      else preview = '';
    }
    preview = preview.slice(0, 100);
  } else {
    const contentLines = note.content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    displayTitle = hasTitle ? note.title : contentLines[0] || '—';
    const previewLine = hasTitle
      ? contentLines[0] || ''
      : contentLines[1] || contentLines[0] || '';
    preview = previewLine.slice(0, 100);
  }

  const dateStr = new Date(note.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const isPinned = !!note.pinned;

  const handleDelete = () => {
    Alert.alert('Delete Note', `Delete "${displayTitle}"?`, [
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
        <View style={styles.leftColumn}>
          <ThemedText type="defaultSemiBold" style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {displayTitle}
          </ThemedText>
          {preview.length > 0 && (
            <ThemedText style={styles.preview} numberOfLines={2}>
              {preview}
            </ThemedText>
          )}
          {uniqueTags.length > 0 && (
            <View style={styles.tags}>
              {uniqueTags.slice(0, 5).map((tag) => (
                <TagChip key={tag.id} name={tag.name} color={tag.color} small />
              ))}
            </View>
          )}
        </View>

        <View style={styles.rightColumn}>
          <ThemedText style={styles.date}>{dateStr}</ThemedText>
          <Pressable
            onPress={() => onTogglePin?.(note.id, !isPinned)}
            hitSlop={8}
            style={styles.pinButton}
          >
            <IconSymbol
              name={isPinned ? 'bookmark.fill' : 'bookmark'}
              size={18}
              color={isPinned ? colors.tint : colors.icon}
            />
          </Pressable>
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
  },
  leftColumn: {
    flex: 1,
    gap: 6,
  },
  rightColumn: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  title: {
    fontSize: 16,
  },
  date: {
    fontSize: 12,
    opacity: 0.5,
  },
  pinButton: {
    paddingTop: 6,
    paddingLeft: 6,
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
