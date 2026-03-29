import { useState, useCallback } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TileGrid } from '@/components/habits/tile-grid';
import { QuickInputModal } from '@/components/ui/quick-input-modal';
import { useHabits } from '@/hooks/use-habits';
import { useTodayRecords } from '@/hooks/use-today-records';
import { useNotes } from '@/hooks/use-notes';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { Habit } from '@/types/habit';

export default function HabitsDayScreen() {
  const { habits, isLoading } = useHabits();
  const { records, toggleBoolean, cycleTriple, incrementCounter, setValue } = useTodayRecords();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { createNote } = useNotes();
  const [valueInputHabit, setValueInputHabit] = useState<Habit | null>(null);

  const handleTap = useCallback(
    (habitId: string) => {
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      switch (habit.recordingMode) {
        case 'boolean':
          toggleBoolean(habitId);
          break;
        case 'triple':
          cycleTriple(habitId);
          break;
        case 'counter':
          incrementCounter(habitId);
          break;
        case 'value':
          setValueInputHabit(habit);
          break;
      }
    },
    [habits, toggleBoolean, cycleTriple, incrementCounter],
  );

  const handleLongPress = useCallback((habitId: string) => {
    router.push({ pathname: '/tile-settings', params: { habitId } });
  }, []);

  const handleValueSubmit = useCallback(
    (value: string) => {
      if (valueInputHabit) {
        setValue(valueInputHabit.id, value);
      }
      setValueInputHabit(null);
    },
    [valueInputHabit, setValue],
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="title" style={styles.headerTitle}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </ThemedText>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.viewLink}
              onPress={() => router.push('/(tabs)/(habits)/week')}
            >
              <ThemedText style={[styles.viewLinkText, { color: colors.tint }]}>Week</ThemedText>
            </Pressable>
            <Pressable
              style={styles.viewLink}
              onPress={() => router.push('/(tabs)/(habits)/month')}
            >
              <ThemedText style={[styles.viewLinkText, { color: colors.tint }]}>Month</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.statsButton, { backgroundColor: colors.tint }]}
              onPress={() => router.push('/(tabs)/(habits)/stats')}
            >
              <ThemedText style={styles.statsButtonText}>📊</ThemedText>
            </Pressable>
          </View>
        </View>

        {habits.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No habits yet</ThemedText>
            <Pressable
              style={[styles.addButton, { backgroundColor: colors.tint }]}
              onPress={() => router.push({ pathname: '/tile-settings', params: { mode: 'create' } })}
            >
              <ThemedText style={styles.addButtonText}>+ Add Your First Habit</ThemedText>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Grid fills all available space */}
            <TileGrid
              habits={habits}
              records={records}
              onTapHabit={handleTap}
              onLongPressHabit={handleLongPress}
            />

            {/* Bottom action buttons */}
            <View style={styles.bottomButtons}>
              <Pressable
                style={[styles.addTileButton, { borderColor: colors.tint, backgroundColor: `${colors.tint}15` }]}
                onPress={() => router.push({ pathname: '/tile-settings', params: { mode: 'create' } })}
              >
                <ThemedText style={[styles.addTileText, { color: colors.tint }]}>+ Add Habit</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.addTileButton, { borderColor: colors.tint, backgroundColor: `${colors.tint}15` }]}
                onPress={async () => {
                  const note = await createNote('');
                  if (note) {
                    router.push(`/(tabs)/(notes)/${note.id}`);
                  }
                }}
              >
                <ThemedText style={[styles.addTileText, { color: colors.tint }]}>+ Add Note</ThemedText>
              </Pressable>
            </View>
          </>
        )}

        <QuickInputModal
          visible={valueInputHabit != null}
          title={valueInputHabit?.name ?? 'Enter Value'}
          onSubmit={handleValueSubmit}
          onCancel={() => setValueInputHabit(null)}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 20,
  },
  statsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsButtonText: {
    fontSize: 18,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  viewLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    opacity: 0.6,
  },
  addButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  bottomButtons: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  addTileButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addTileText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
