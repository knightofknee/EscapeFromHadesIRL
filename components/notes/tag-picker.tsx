import { useState } from 'react';
import { StyleSheet, Modal, View, Pressable, TextInput, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Tag } from '@/types/note';

type TagPickerProps = {
  visible: boolean;
  tags: Tag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (name: string) => void;
  onClose: () => void;
};

export function TagPicker({
  visible,
  tags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onClose,
}: TagPickerProps) {
  const [newTagName, setNewTagName] = useState('');
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  function handleCreate() {
    if (!newTagName.trim()) return;
    onCreateTag(newTagName.trim());
    setNewTagName('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.tileBackground }]}>
          <View style={styles.header}>
            <ThemedText type="defaultSemiBold">Tags</ThemedText>
            <Pressable onPress={onClose}>
              <ThemedText style={{ color: colors.tint }}>Done</ThemedText>
            </Pressable>
          </View>

          <View style={styles.createRow}>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
              value={newTagName}
              onChangeText={setNewTagName}
              placeholder="New tag name..."
              placeholderTextColor={colors.icon}
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
            <Pressable
              style={[styles.createButton, { backgroundColor: colors.tint }]}
              onPress={handleCreate}
            >
              <ThemedText style={styles.createText}>+</ThemedText>
            </Pressable>
          </View>

          <ScrollView style={styles.tagList} contentContainerStyle={styles.tagListContent}>
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                selected={selectedTagIds.includes(tag.id)}
                onPress={() => onToggleTag(tag.id)}
              />
            ))}
            {tags.length === 0 && (
              <ThemedText style={styles.emptyText}>No tags yet. Create one above.</ThemedText>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  content: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  createRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  createButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  tagList: {
    flex: 1,
  },
  tagListContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyText: {
    opacity: 0.5,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
