import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, Keyboard, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  useReanimatedKeyboardAnimation,
  KeyboardAwareScrollView,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NoteEditor, type NoteEditorHandle } from '@/components/notes/note-editor';
import { useNotes } from '@/hooks/use-notes';
import { useTags } from '@/hooks/use-tags';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { InlineTag } from '@/types/note';

const DISMISS_BAR_HEIGHT = 40;
// Keep caret comfortably above the dismiss bar when typing.
const CARET_CLEARANCE = DISMISS_BAR_HEIGHT + 24;

// In-memory map of scroll position per note id — persists while app is running.
// Keeps scroll position when navigating away from and back to a note.
const scrollPositions = new Map<string, number>();

export default function NoteEditorScreen() {
  const { id, new: isNewParam } = useLocalSearchParams<{ id: string; new?: string }>();
  const isNew = isNewParam === '1';
  const { notes, isLoading: notesLoading, updateNote, deleteNote } = useNotes();
  const { tags, createTag } = useTags();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const tabBarHeight = useBottomTabBarHeight();
  const { height: kbHeight, progress } = useReanimatedKeyboardAnimation();
  const [isFocused, setIsFocused] = useState(false);

  // Ref to NoteEditor for imperative formatting commands
  const noteEditorRef = useRef<NoteEditorHandle>(null);

  // Scroll ref for position save/restore across navigation.
  const scrollRef = useRef<ScrollView>(null);

  // Dismiss bar slides with keyboard via Reanimated
  const animatedBarStyle = useAnimatedStyle(() => ({
    transform: [{
      translateY: DISMISS_BAR_HEIGHT * (1 - progress.value) + tabBarHeight + kbHeight.value,
    }],
  }));

  // Scroll position persistence across navigation
  const hasRestoredRef = useRef(false);
  // Reset restore flag whenever we navigate to a different note
  useEffect(() => {
    hasRestoredRef.current = false;
  }, [id]);

  const saveScrollPos = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (id) scrollPositions.set(id, e.nativeEvent.contentOffset.y);
  }, [id]);

  const restoreScrollPos = useCallback(() => {
    if (hasRestoredRef.current || !id) return;
    const saved = scrollPositions.get(id);
    if (saved && saved > 0) {
      scrollRef.current?.scrollTo({ y: saved, animated: false });
    }
    hasRestoredRef.current = true;
  }, [id]);

  const note = notes.find((n) => n.id === id);
  const noteRef = useRef(note);
  noteRef.current = note;

  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      const n = noteRef.current;
      if (n && !n.title.trim() && !n.content.trim()) {
        deleteNote(n.id);
      }
    });
    return unsubscribe;
  }, [navigation, deleteNote]);

  const handleUpdateTitle = useCallback(
    (title: string) => {
      if (id) updateNote(id, { title });
    },
    [id, updateNote],
  );

  const handleUpdateContent = useCallback(
    (content: string) => {
      if (id) updateNote(id, { content });
    },
    [id, updateNote],
  );

  const handleUpdateTags = useCallback(
    (noteTags: InlineTag[]) => {
      if (id) updateNote(id, { tags: noteTags });
    },
    [id, updateNote],
  );

  const handleCreateTag = useCallback(
    async (name: string) => {
      await createTag(name);
    },
    [createTag],
  );

  if (!note) {
    // Still loading notes — show spinner. Only show "not found" once loading is done.
    return (
      <ThemedView style={styles.centered}>
        {notesLoading ? (
          <ActivityIndicator size="large" color={colors.tint} />
        ) : (
          <ThemedText>Note not found</ThemedText>
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton} hitSlop={8}>
            <IconSymbol name="chevron.left" size={22} color={'#3B82F6'} />
            <ThemedText style={[styles.headerButtonText, { color: '#3B82F6' }]}>Notes</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => { setIsFocused(false); Keyboard.dismiss(); }}
            disabled={!isFocused}
            style={styles.headerButton}
            hitSlop={8}
          >
            <ThemedText style={[styles.headerButtonText, { color: isFocused ? colors.tint : colors.icon }]}>Done</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>

      <KeyboardAwareScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        bottomOffset={CARET_CLEARANCE}
        disableScrollOnKeyboardHide
        onScrollEndDrag={saveScrollPos}
        onMomentumScrollEnd={saveScrollPos}
        onContentSizeChange={restoreScrollPos}
      >
        <NoteEditor
          ref={noteEditorRef}
          note={note}
          tags={tags}
          isNew={isNew}
          onUpdateTitle={handleUpdateTitle}
          onUpdateContent={handleUpdateContent}
          onUpdateTags={handleUpdateTags}
          onCreateTag={handleCreateTag}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </KeyboardAwareScrollView>

      <Animated.View
        style={[
          styles.dismissBar,
          { backgroundColor: colors.background, borderTopColor: colors.tileBorder },
          animatedBarStyle,
        ]}
      >
        <Pressable
          onPress={() => noteEditorRef.current?.applyStrikethrough()}
          style={styles.toolbarButton}
          hitSlop={8}
        >
          <IconSymbol name="strikethrough" size={20} color={colors.icon} />
        </Pressable>
        <Pressable
          onPress={() => noteEditorRef.current?.applyBullets()}
          style={styles.toolbarButton}
          hitSlop={8}
        >
          <IconSymbol name="list.bullet" size={20} color={colors.icon} />
        </Pressable>
        <Pressable
          onPress={() => noteEditorRef.current?.applyNumberedList()}
          style={styles.toolbarButton}
          hitSlop={8}
        >
          <IconSymbol name="list.number" size={20} color={colors.icon} />
        </Pressable>
        <View style={styles.dismissSpacer} />
        <Pressable onPress={Keyboard.dismiss} style={styles.dismissButton} hitSlop={8}>
          <IconSymbol name="keyboard.chevron.compact.down" size={22} color={colors.icon} />
        </Pressable>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dismissBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dismissSpacer: {
    flex: 1,
  },
  dismissButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  toolbarButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
