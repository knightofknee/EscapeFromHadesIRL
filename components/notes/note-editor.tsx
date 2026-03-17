import { useState, useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View, Pressable, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { TagPicker } from './tag-picker';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Note, Tag, InlineTag } from '@/types/note';

type NoteEditorProps = {
  note: Note;
  tags: Tag[];
  onUpdateTitle: (title: string) => void;
  onUpdateContent: (content: string) => void;
  onUpdateTags: (tags: InlineTag[]) => void;
  onCreateTag: (name: string) => void;
};

export function NoteEditor({
  note,
  tags,
  onUpdateTitle,
  onUpdateContent,
  onUpdateTags,
  onCreateTag,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.id]);

  function handleTitleChange(text: string) {
    setTitle(text);
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onUpdateTitle(text), 500);
  }

  function handleContentChange(text: string) {
    setContent(text);
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onUpdateContent(text), 500);
  }

  const noteTagIds = [...new Set(note.tags.map((t) => t.tagId))];
  const noteTags = noteTagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean) as Tag[];

  function handleToggleTag(tagId: string) {
    const existing = note.tags.filter((t) => t.tagId === tagId);
    let newTags: InlineTag[];
    if (existing.length > 0) {
      // Remove all instances of this tag
      newTags = note.tags.filter((t) => t.tagId !== tagId);
    } else {
      // Add tag at document level (position 0-0)
      newTags = [...note.tags, { tagId, startIndex: 0, endIndex: 0 }];
    }
    onUpdateTags(newTags);
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.titleInput, { color: colors.text }]}
        value={title}
        onChangeText={handleTitleChange}
        placeholder="Note title..."
        placeholderTextColor={colors.icon}
        autoFocus={!note.title}
      />

      {/* Tags bar */}
      <View style={styles.tagsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsScroll}>
          {noteTags.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              color={tag.color}
              selected
              small
              onPress={() => handleToggleTag(tag.id)}
            />
          ))}
          <Pressable
            style={[styles.addTagButton, { borderColor: colors.tileBorder }]}
            onPress={() => setShowTagPicker(true)}
          >
            <ThemedText style={[styles.addTagText, { color: colors.icon }]}>+ Tag</ThemedText>
          </Pressable>
        </ScrollView>
      </View>

      {/* Content */}
      <TextInput
        style={[styles.contentInput, { color: colors.text }]}
        value={content}
        onChangeText={handleContentChange}
        placeholder="Start writing..."
        placeholderTextColor={colors.icon}
        multiline
        textAlignVertical="top"
        scrollEnabled={false}
      />

      <TagPicker
        visible={showTagPicker}
        tags={tags}
        selectedTagIds={noteTagIds}
        onToggleTag={handleToggleTag}
        onCreateTag={onCreateTag}
        onClose={() => setShowTagPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tagsBar: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  tagsScroll: {
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addTagButton: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addTagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 200,
  },
});
