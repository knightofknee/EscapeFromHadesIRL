import { Fragment, forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Suggestion } from '@/lib/word-suggestions';

/**
 * The word/tag autocomplete strip that rides directly above the keyboard
 * toolbar in the notes editor — iOS-predictive-bar style: up to three
 * tappable slots, never inline ghost text.
 *
 * Fixed height, always mounted in text mode: the editor screen's
 * keep-caret-visible math budgets for it, so it must not appear/disappear
 * per keystroke. When there's nothing to suggest it's just a quiet strip.
 *
 * Suggestions arrive via the imperative handle (NoteEditor pushes them on
 * every keystroke) so only this strip re-renders while typing — the parent
 * screen deliberately never re-renders per keystroke.
 */

export const SUGGESTION_BAR_HEIGHT = 44;

export type SuggestionBarHandle = {
  setSuggestions: (suggestions: Suggestion[]) => void;
};

type SuggestionBarProps = {
  onPick: (suggestion: Suggestion) => void;
};

export const SuggestionBar = forwardRef<SuggestionBarHandle, SuggestionBarProps>(
  function SuggestionBar({ onPick }, ref) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'light'];

    useImperativeHandle(ref, () => ({ setSuggestions }), []);

    return (
      <View style={[styles.bar, { borderBottomColor: colors.tileBorder }]}>
        {suggestions.map((s, i) => (
          <Fragment key={s.kind === 'tag' ? `tag:${s.tagId}` : `word:${s.display}`}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: colors.tileBorder }]} />}
            {s.kind === 'tag' ? (
              <View style={styles.cell}>
                <TagChip name={s.name} color={s.color} selected small onPress={() => onPick(s)} />
              </View>
            ) : (
              <Pressable style={styles.cell} onPress={() => onPick(s)} hitSlop={4}>
                <ThemedText numberOfLines={1} style={styles.word}>
                  {s.display}
                </ThemedText>
              </Pressable>
            )}
          </Fragment>
        ))}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  bar: {
    height: SUGGESTION_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 22,
  },
  word: {
    fontSize: 15,
    fontWeight: '500',
  },
});
