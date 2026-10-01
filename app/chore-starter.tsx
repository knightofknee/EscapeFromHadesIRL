import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { CHORE_PRESET_GROUPS, type ChorePreset } from '@/constants/chore-presets';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useChores } from '@/contexts/chores-context';
import { formatFrequency } from '@/lib/chores';

/** Pick starter chores in bulk. Already-tracked ones show as added. */
export default function ChoreStarterScreen() {
  const { chores, createChores } = useChores();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const existingNames = useMemo(
    () => new Set(chores.map((c) => c.name.trim().toLowerCase())),
    [chores],
  );

  function toggle(preset: ChorePreset) {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(preset.name)) next.delete(preset.name);
      else next.add(preset.name);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    const drafts = CHORE_PRESET_GROUPS.flatMap((g) => g.presets).filter((p) => selected.has(p.name));
    const ok = await createChores(drafts);
    setSaving(false);
    if (ok) router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.navHeader}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ThemedText style={[styles.cancelText, { color: colors.tint }]}>Cancel</ThemedText>
          </Pressable>
          <View style={styles.navTitleWrap} pointerEvents="none">
            <ThemedText style={styles.navTitle}>Suggested Chores</ThemedText>
          </View>
          <View style={{ width: 50 }} />
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={styles.intro}>
          Pick what you want to keep track of. Frequencies follow the named source where one exists.
          Change any of them, or add your own, any time.
        </ThemedText>
        {CHORE_PRESET_GROUPS.map((group) => (
          <View key={group.title} style={styles.group}>
            <ThemedText type="defaultSemiBold" style={styles.groupTitle}>
              {group.title}
            </ThemedText>
            <View style={styles.bubbles}>
              {group.presets.map((preset) => {
                const added = existingNames.has(preset.name.toLowerCase());
                const on = selected.has(preset.name);
                return (
                  <Pressable
                    key={preset.name}
                    disabled={added}
                    onPress={() => toggle(preset)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on || added, disabled: added }}
                    style={[
                      styles.bubble,
                      {
                        borderColor: on ? colors.tint : colors.tileBorder,
                        backgroundColor: on ? `${colors.tint}22` : colors.tileBackground,
                      },
                      added && { opacity: 0.45 },
                    ]}
                  >
                    <ThemedText style={styles.bubbleEmoji}>{preset.emoji}</ThemedText>
                    <View>
                      <ThemedText style={styles.bubbleName}>{preset.name}</ThemedText>
                      <ThemedText style={styles.bubbleFreq}>
                        {added
                          ? 'Added'
                          : preset.source
                            ? `${formatFrequency(preset.frequencyDays)} · ${preset.source}`
                            : formatFrequency(preset.frequencyDays)}
                      </ThemedText>
                    </View>
                    {on && <ThemedText style={[styles.bubbleCheck, { color: colors.tint }]}>✓</ThemedText>}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <SafeAreaView edges={['bottom']} style={[styles.footer, { borderTopColor: colors.tileBorder }]}>
        <Pressable
          onPress={handleAdd}
          disabled={selected.size === 0 || saving}
          style={[
            styles.addButton,
            { backgroundColor: colors.tint },
            (selected.size === 0 || saving) && { opacity: 0.4 },
          ]}
        >
          <ThemedText style={styles.addText}>
            {selected.size === 0
              ? 'Pick some chores'
              : `Add ${selected.size} chore${selected.size === 1 ? '' : 's'}`}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  navHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  navTitleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  navTitle: { fontSize: 17, fontWeight: '600' },
  cancelText: { fontSize: 16, fontWeight: '500' },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 14, opacity: 0.65 },
  group: { marginTop: 20 },
  groupTitle: { fontSize: 15, marginBottom: 8 },
  bubbles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleEmoji: { fontSize: 22, lineHeight: 28 },
  bubbleName: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  bubbleFreq: { fontSize: 11, opacity: 0.55, lineHeight: 14 },
  bubbleCheck: { fontSize: 16, fontWeight: '900' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12 },
  addButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  addText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
