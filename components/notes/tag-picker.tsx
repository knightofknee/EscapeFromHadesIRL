import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, TextInput, ScrollView, Keyboard } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
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
  const { height: kbHeight, progress } = useReanimatedKeyboardAnimation();
  const tabBarHeight = useBottomTabBarHeight();
  const inputRef = useRef<TextInput>(null);

  // Sheet anchors to the screen's bottom (above the tab bar). When the keyboard
  // opens, lift by |kbHeight| + tabBarHeight so the sheet's bottom lands just
  // above the keyboard — KEYBOARD_GAP leaves a small sliver of note content
  // visible between the sheet and the keyboard for visual separation.
  const KEYBOARD_GAP = 12;
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          kbHeight.value + (tabBarHeight - KEYBOARD_GAP) * progress.value,
      },
    ],
  }));

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [visible]);

  function handleCreate() {
    if (!newTagName.trim()) return;
    onCreateTag(newTagName.trim());
    setNewTagName('');
  }

  function handleClose() {
    Keyboard.dismiss();
    setNewTagName('');
    onClose();
  }

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <Animated.View
        style={[styles.sheet, { backgroundColor: colors.tileBackground }, sheetStyle]}
      >
        <View style={styles.header}>
          <ThemedText type="defaultSemiBold">Tags</ThemedText>
          <Pressable onPress={handleClose} hitSlop={8}>
            <ThemedText style={{ color: colors.tint }}>Done</ThemedText>
          </Pressable>
        </View>

        <View style={styles.createRow}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text, borderColor: colors.tileBorder }]}
            value={newTagName}
            onChangeText={setNewTagName}
            placeholder="New tag name..."
            placeholderTextColor={colors.icon}
            keyboardAppearance={colorScheme === 'dark' ? 'dark' : 'light'}
            autoCapitalize="none"
            autoCorrect={false}
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

        <ScrollView
          style={styles.tagList}
          contentContainerStyle={styles.tagListContent}
          keyboardShouldPersistTaps="handled"
        >
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    padding: 20,
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
    maxHeight: 280,
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
