import { Fragment, forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { TagChip } from './tag-chip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Suggestion } from '@/lib/word-suggestions';

/**
 * The word/tag autocomplete strip that rides directly above the keyboard
 * toolbar in the notes editor — iOS-predictive-bar style: up to three
 * tappable slots, never inline ghost text.
 *
 * Auto-hiding: renders nothing (zero height) when there are no suggestions,
 * and pops in only when the personal vocabulary has a match. The bar stack
 * it lives in is bottom-anchored, so it grows upward over the note without
 * shifting the toolbar. The editor screen's keep-caret-visible math budgets
 * for its full height as the worst case (SUGGESTION_BAR_HEIGHT), so caret
 * clearance stays correct whether or not it's showing.
 *
 * Suggestions arrive via the imperative handle (NoteEditor pushes them on
 * every keystroke) so only this strip re-renders while typing — the parent
 * screen deliberately never re-renders per keystroke.
 */

export const SUGGESTION_BAR_HEIGHT = 44;

/** The photo or video the caret is touching (see NoteEditor). */
export type MediaChip = { name: string; kind: 'photo' | 'video' };

export type SuggestionBarHandle = {
  setSuggestions: (suggestions: Suggestion[]) => void;
  setMediaChip: (chip: MediaChip | null) => void;
};

type SuggestionBarProps = {
  onPick: (suggestion: Suggestion) => void;
  onOpenMedia: (chip: MediaChip) => void;
};

export const SuggestionBar = forwardRef<SuggestionBarHandle, SuggestionBarProps>(
  function SuggestionBar({ onPick, onOpenMedia }, ref) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    // Inline images don't report taps, so when the caret sits beside one the
    // strip offers to open it. Only shown when there are no word chips (the
    // caret is never mid-word beside an image anyway).
    const [mediaChip, setMediaChip] = useState<MediaChip | null>(null);
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'light'];

    useImperativeHandle(ref, () => ({ setSuggestions, setMediaChip }), []);

    if (suggestions.length === 0 && mediaChip) {
      const label = mediaChip.kind === 'video' ? 'Play video' : 'View photo';
      return (
        <View style={[styles.bar, { borderBottomColor: colors.tileBorder }]}>
          <Pressable
            style={styles.cell}
            onPress={() => onOpenMedia(mediaChip)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <View style={styles.mediaRow}>
              <IconSymbol name={mediaChip.kind === 'video' ? 'play.fill' : 'photo'} size={16} color={colors.tint} />
              <ThemedText style={[styles.word, { color: colors.tint }]}>{label}</ThemedText>
            </View>
          </Pressable>
        </View>
      );
    }

    // Nothing to suggest → no strip at all (Apple's bar handles the generic
    // case; this one only speaks up when the personal vocab has something).
    if (suggestions.length === 0) return null;

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
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
