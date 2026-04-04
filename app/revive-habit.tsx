import { useState } from 'react';
import { StyleSheet, ScrollView, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHabits, useArchivedHabits } from '@/hooks/use-habits';

export default function ReviveHabitScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { reviveHabit } = useHabits();
  const { habits: archived, isLoading } = useArchivedHabits();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviving, setReviving] = useState(false);

  async function handleRevive() {
    if (!selectedId) return;
    setReviving(true);
    await reviveHabit(selectedId);
    router.dismissAll();
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <ThemedText style={[styles.backText, { color: colors.tint }]}>← Back</ThemedText>
        </Pressable>
        <ThemedText type="defaultSemiBold" style={styles.title}>Archived Habits</ThemedText>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isLoading ? (
          <ThemedText style={styles.emptyText}>Loading...</ThemedText>
        ) : archived.length === 0 ? (
          <ThemedText style={styles.emptyText}>No archived habits</ThemedText>
        ) : (
          archived.map((h) => {
            const isSelected = selectedId === h.id;
            return (
              <Pressable
                key={h.id}
                style={[
                  styles.habitRow,
                  {
                    borderColor: isSelected ? h.color : colors.tileBorder,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedId(isSelected ? null : h.id)}
              >
                <View style={[styles.dot, { backgroundColor: h.color }]} />
                <View style={styles.habitInfo}>
                  <ThemedText style={styles.habitName}>{h.name}</ThemedText>
                  <ThemedText style={[styles.habitMeta, { color: colors.icon }]}>
                    {h.recordingMode} · {h.icon ?? h.abbreviation}
                  </ThemedText>
                </View>
                {isSelected && (
                  <ThemedText style={[styles.check, { color: h.color }]}>✓</ThemedText>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {selectedId && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.reviveButton, { backgroundColor: colors.tint }]}
            onPress={handleRevive}
            disabled={reviving}
          >
            <ThemedText style={styles.reviveText}>
              {reviving ? 'Reviving...' : 'Revive Habit'}
            </ThemedText>
          </Pressable>
        </View>
      )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 17,
  },
  scrollContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 100,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    paddingVertical: 40,
    fontSize: 15,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  habitInfo: {
    flex: 1,
    gap: 2,
  },
  habitName: {
    fontSize: 16,
    fontWeight: '600',
  },
  habitMeta: {
    fontSize: 12,
  },
  check: {
    fontSize: 20,
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
  },
  reviveButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
