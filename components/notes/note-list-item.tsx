import { memo, useRef } from 'react';
import { StyleSheet, Pressable, View, Alert, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Note, Tag } from '@/types/note';
import { noteDisplayLines } from '@/lib/note-content';

type NoteListItemProps = {
  note: Note;
  tags: Tag[];
  /** Active list sort — the row's primary date matches it. */
  sortBy?: 'updated' | 'created';
  onPress: (noteId: string) => void;
  onDelete?: (noteId: string) => void;
  onTogglePin?: (noteId: string, pinned: boolean) => void;
};

/** Enough text to fill the preview's lines on a wide phone; the rest is cut by numberOfLines. */
const PREVIEW_CHARS = 400;

export const NoteListItem = memo(function NoteListItem({ note, tags, sortBy = 'updated', onPress, onDelete, onTogglePin }: NoteListItemProps) {
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
    // Prefer the denormalized summary (no per-note items read). Notes that
    // predate the items-subcollection migration and haven't been opened
    // since have no summary yet — fall back to the legacy `checklist`
    // array so their preview still renders.
    const summary = note.checklistSummary;
    let firstUncompletedText: string;
    let hasAnyItem: boolean;
    let allDone: boolean;
    if (summary) {
      firstUncompletedText = summary.firstUncompleted;
      hasAnyItem = summary.total > 0;
      allDone = hasAnyItem && summary.firstUncompleted === '';
    } else {
      const items = note.checklist ?? [];
      firstUncompletedText =
        items.find((i) => !i.completed && i.text.trim().length > 0)?.text ?? '';
      hasAnyItem = items.some((i) => i.text.trim().length > 0);
      allDone = hasAnyItem && items.every((i) => i.completed || !i.text.trim());
    }

    if (hasTitle) {
      displayTitle = note.title;
    } else if (desc.length > 0) {
      displayTitle = desc.split('\n')[0]!;
    } else if (firstUncompletedText) {
      displayTitle = firstUncompletedText;
    } else if (hasAnyItem) {
      displayTitle = '✓';
    } else {
      displayTitle = 'Empty checklist';
    }

    if (hasTitle) {
      // Title is the explicit one; preview is description or first task.
      if (desc.length > 0) preview = desc.split('\n')[0]!;
      else if (firstUncompletedText) preview = firstUncompletedText;
      else if (allDone) preview = '✓';
      else preview = '';
    } else {
      // displayTitle already consumed the best preview slot; secondary
      // preview line shows the next-most-relevant string, if any.
      if (desc.length > 0 && firstUncompletedText) preview = firstUncompletedText;
      else preview = '';
    }
    preview = preview.slice(0, PREVIEW_CHARS);
  } else {
    // Rich notes store HTML: read their visible lines, never the markup.
    const contentLines = noteDisplayLines(note)
      .map((l) => l.trim())
      .filter(Boolean);
    const hasPhoto = note.format === 'html' && note.content.includes('<img');
    displayTitle = hasTitle ? note.title : contentLines[0] || (hasPhoto ? 'Photo' : 'Empty note');
    // Everything after the title line, run together so short lines (lists,
    // jottings) fill the preview's width instead of one line each.
    preview = (hasTitle ? contentLines : contentLines.slice(1)).join(' · ').slice(0, PREVIEW_CHARS);
  }

  // Primary date matches the active sort so the list visibly reads in order.
  // The other date rides beneath in a smaller line when it's a different day,
  // so editing an old note doesn't erase when it was written (and vice versa).
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const byCreated = sortBy === 'created';
  const primaryMs = byCreated ? note.createdAt : note.updatedAt;
  const secondaryMs = byCreated ? note.updatedAt : note.createdAt;
  const dateStr = fmt(primaryMs);
  // Year-safe same-day check (formatted strings drop the year).
  const sameDay = new Date(primaryMs).toDateString() === new Date(secondaryMs).toDateString();
  const secondaryStr = sameDay ? null : `${byCreated ? 'edited' : 'created'} ${fmt(secondaryMs)}`;

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
        onPress={() => onPress(note.id)}
      >
        {/* Title line carries the date and bookmark, so the preview below
            gets the card's full width. */}
        <View style={styles.titleRow}>
          <ThemedText type="defaultSemiBold" style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {displayTitle}
          </ThemedText>
          {/* The other date tucks under the main one (when it's a different
              day) instead of costing the card a line of its own. */}
          <View style={styles.dates}>
            <ThemedText style={styles.date}>{dateStr}</ThemedText>
            {secondaryStr && <ThemedText style={styles.dateSecondary}>{secondaryStr}</ThemedText>}
          </View>
          <Pressable
            onPress={() => onTogglePin?.(note.id, !isPinned)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isPinned ? 'Remove bookmark' : 'Bookmark note'}
          >
            <IconSymbol
              name={isPinned ? 'bookmark.fill' : 'bookmark'}
              size={16}
              color={isPinned ? colors.tint : colors.icon}
            />
          </Pressable>
        </View>
        {preview.length > 0 && (
          <ThemedText style={styles.preview} numberOfLines={3}>
            {preview}
          </ThemedText>
        )}
        {uniqueTags.length > 0 && (
          <View style={styles.tagRow}>
            {uniqueTags.slice(0, 5).map((tag) => (
              <TagChip key={tag.id} name={tag.name} color={tag.color} small dense />
            ))}
          </View>
        )}
      </Pressable>
    </Swipeable>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
  },
  dates: {
    alignItems: 'flex-end',
  },
  date: {
    fontSize: 12,
    lineHeight: 15,
    opacity: 0.5,
  },
  preview: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 19,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  dateSecondary: {
    fontSize: 10,
    lineHeight: 12,
    opacity: 0.4,
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
