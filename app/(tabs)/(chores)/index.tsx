import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { CHORE_LAYOUT_TRANSITION, ChoreRow } from '@/components/chores/chore-row';
import { ChoreSheet } from '@/components/chores/chore-sheet';
import { CHORE_SECTION_TITLES, choreInkColor, choreSectionColor } from '@/components/chores/chore-colors';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTodayDate } from '@/hooks/use-today-date';
import { useChores } from '@/contexts/chores-context';
import { useOfflineGuard } from '@/contexts/offline-context';
import { isPastDue, sortChores, type ChoreSection } from '@/lib/chores';

export default function ChoresScreen() {
  const { chores, isLoading, isOffline, markDone, unmarkDone, deleteChores } = useChores();
  const { requireOnline } = useOfflineGuard();
  const { todayStr } = useTodayDate();
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(() => sortChores(chores, todayStr), [chores, todayStr]);
  const counts = useMemo(() => {
    const c = { late: 0, soon: 0 };
    const bySection: Record<ChoreSection, number> = { dueTasks: 0, dueChores: 0, tasks: 0, chores: 0, done: 0 };
    for (const { status, section } of sorted) {
      if (isPastDue(status.state)) c.late++;
      if (status.state === 'soon') c.soon++;
      bySection[section]++;
    }
    return { ...c, bySection };
  }, [sorted]);
  const openChore = chores.find((c) => c.id === openId) ?? null;

  const onToggleDate = useCallback(
    (id: string, date: string, done: boolean) => {
      if (done) unmarkDone(id, date);
      else markDone(id, date);
    },
    [markDone, unmarkDone],
  );

  function clearDone() {
    const ids = sorted.filter(({ section }) => section === 'done').map(({ chore }) => chore.id);
    if (ids.length === 0) return;
    Alert.alert(
      `Clear ${ids.length} done task${ids.length === 1 ? '' : 's'}?`,
      'They will be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => void deleteChores(ids) },
      ],
    );
  }

  if (isLoading && !isOffline) return <LoadingScreen />;

  // One flat list of headers + rows under a single parent, so a row that
  // changes section keeps its component (and its animation) and glides there.
  const items: ({ kind: 'header'; section: ChoreSection } | { kind: 'row'; index: number })[] = [];
  let lastSection: ChoreSection | null = null;
  sorted.forEach(({ section }, index) => {
    if (section !== lastSection) {
      items.push({ kind: 'header', section });
      lastSection = section;
    }
    items.push({ kind: 'row', index });
  });

  const actionCount = counts.late + counts.soon;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.title}>Chores</ThemedText>
            {chores.length > 0 && (
              <View style={styles.summary}>
                {actionCount === 0 ? (
                  <ThemedText style={[styles.summaryText, { color: choreInkColor('fresh', scheme) }]}>
                    All caught up
                  </ThemedText>
                ) : (
                  <>
                    {counts.late > 0 && (
                      <ThemedText style={[styles.summaryText, { color: choreInkColor('due', scheme) }]}>
                        {counts.late} due
                      </ThemedText>
                    )}
                    {counts.late > 0 && counts.soon > 0 && <ThemedText style={styles.summaryDot}>·</ThemedText>}
                    {counts.soon > 0 && (
                      <ThemedText style={[styles.summaryText, { color: choreInkColor('soon', scheme) }]}>
                        {counts.soon} coming up
                      </ThemedText>
                    )}
                  </>
                )}
              </View>
            )}
          </View>
          <Pressable
            onPress={() => router.push('/chore-starter')}
            hitSlop={8}
            style={styles.textButton}
            accessibilityRole="button"
          >
            <ThemedText style={[styles.textButtonLabel, { color: colors.tint }]}>Suggestions</ThemedText>
          </Pressable>
          <Pressable
            onPress={() => router.push('/chore-edit')}
            style={[styles.addButton, { backgroundColor: colors.tint }]}
            accessibilityRole="button"
            accessibilityLabel="New chore"
          >
            <ThemedText style={styles.addButtonText}>+</ThemedText>
          </Pressable>
        </View>

        {chores.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText style={styles.emptyEmoji}>🧺</ThemedText>
            <ThemedText style={styles.emptyTitle}>How long has it been?</ThemedText>
            <ThemedText style={styles.emptyBody}>
              Sheets, litter, the toilet, calling home. Log it when you do it and each chore turns
              green, then blue, then gold once it's due.
            </ThemedText>
            <Pressable
              onPress={() => router.push('/chore-starter')}
              style={[styles.primary, { backgroundColor: colors.tint }]}
              accessibilityRole="button"
            >
              <ThemedText style={styles.primaryText}>Pick from suggestions</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.push('/chore-edit')} style={styles.secondary} accessibilityRole="button">
              <ThemedText style={[styles.secondaryText, { color: colors.tint }]}>Create your own</ThemedText>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {items.map((item) => {
              if (item.kind === 'header') {
                const count = counts.bySection[item.section];
                const dot = choreSectionColor(item.section);
                return (
                  <Animated.View
                    key={`h-${item.section}`}
                    layout={CHORE_LAYOUT_TRANSITION}
                    entering={FadeIn.duration(250)}
                    exiting={FadeOut.duration(150)}
                    style={styles.sectionHeader}
                  >
                    {dot && <View style={[styles.sectionDot, { backgroundColor: dot }]} />}
                    <ThemedText style={styles.sectionTitle}>
                      {CHORE_SECTION_TITLES[item.section]}
                    </ThemedText>
                    <ThemedText style={styles.sectionCount}>{count}</ThemedText>
                    {item.section === 'done' && (
                      <Pressable
                        onPress={clearDone}
                        hitSlop={8}
                        style={styles.sectionAction}
                        accessibilityRole="button"
                        accessibilityLabel="Clear done tasks"
                      >
                        <ThemedText style={[styles.sectionActionText, { color: colors.tint }]}>Clear</ThemedText>
                      </Pressable>
                    )}
                  </Animated.View>
                );
              }
              const { chore, status } = sorted[item.index];
              return (
                <ChoreRow
                  key={chore.id}
                  chore={chore}
                  status={status}
                  today={todayStr}
                  canWrite={requireOnline}
                  onDone={(date) => markDone(chore.id, date)}
                  onUndo={(date) => unmarkDone(chore.id, date)}
                  onOpen={() => setOpenId(chore.id)}
                />
              );
            })}
          </ScrollView>
        )}

        <ChoreSheet
          chore={openChore}
          today={todayStr}
          onClose={() => setOpenId(null)}
          onToggleDate={(date, done) => openChore && onToggleDate(openChore.id, date, done)}
          onEdit={() => {
            const id = openId;
            setOpenId(null);
            if (id) router.push({ pathname: '/chore-edit', params: { id } });
          }}
        />
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  title: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { fontSize: 15, fontWeight: '700' },
  summaryDot: { fontSize: 15, opacity: 0.5 },
  textButton: { paddingVertical: 6 },
  textButtonLabel: { fontSize: 15, fontWeight: '600' },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#fff', fontSize: 28, fontWeight: '600', lineHeight: 32 },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  sectionDot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.8 },
  sectionCount: { fontSize: 13, fontWeight: '600', opacity: 0.45 },
  sectionAction: { marginLeft: 'auto' },
  sectionActionText: { fontSize: 14, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyEmoji: { fontSize: 56, lineHeight: 68 },
  emptyTitle: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  emptyBody: { fontSize: 15, opacity: 0.65, textAlign: 'center' },
  primary: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { paddingVertical: 10 },
  secondaryText: { fontSize: 15, fontWeight: '600' },
});
