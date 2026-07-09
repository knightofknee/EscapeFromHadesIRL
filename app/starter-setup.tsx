import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  CORE_STARTER_KEYS,
  STARTER_TASKS,
  type StarterTask,
} from '@/constants/starter-tasks';
import { Colors } from '@/constants/theme';
import { useTour } from '@/contexts/tour-context';
import { useUserSettingsContext } from '@/contexts/user-settings-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHabits } from '@/hooks/use-habits';
import { useQuests } from '@/hooks/use-quests';
import { useTodayDate } from '@/hooks/use-today-date';
import { emitError } from '@/lib/error-bus';
import { applyStarterTasks, isStarterAdded } from '@/lib/starter-tasks';
import { setPendingHabitCallback } from '@/lib/pending-habit-link';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Intro bubble-picker for adding preset habits + their linked quests. Two
 * groups: "The Path" (walk/meditate/read) pre-selected (opt-out), and "Worthy
 * Pursuits" (write/exercise/yoga/music) opt-in. Reached two ways:
 *   - `?intro=1` — the start of the Genesis tour for brand-new users. On
 *     finish/skip it hands off to the spotlight tour (which gates on having a
 *     habit), so the "you need ≥1 habit" rule is enforced downstream.
 *   - no param — re-launched later from the habits ••• menu; already-added
 *     presets are grayed out, and it just returns when done.
 */
export default function StarterSetupScreen() {
  const params = useLocalSearchParams<{ intro?: string }>();
  const isIntro = params.intro === '1';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { habits, createHabit } = useHabits();
  const { quests, createQuest } = useQuests();
  const { setShowAllTileNames } = useUserSettingsContext();
  const { todayStr } = useTodayDate();
  const { startGenesis } = useTour();
  const [busy, setBusy] = useState(false);
  // Synchronous guard: `busy` state lags a frame, so two fast taps could both
  // run applyStarterTasks concurrently and create duplicate habits.
  const finishingRef = useRef(false);
  // Set true when the user creates a habit via "Create your own" so we can
  // confirm it back to them on return.
  const [customAdded, setCustomAdded] = useState(false);
  // The tutorial opens on a welcome page (hello + the concept), then the
  // picker. Standalone (non-intro) opens straight to the picker.
  const [page, setPage] = useState<'welcome' | 'pick'>(isIntro ? 'welcome' : 'pick');

  const addedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const t of STARTER_TASKS) if (isStarterAdded(t, habits, quests)) s.add(t.key);
    return s;
  }, [habits, quests]);

  // Core pre-selected (opt-out); pursuits start empty (opt-in). Already-added
  // are never auto-selected — applyStarterTasks skips them regardless.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(CORE_STARTER_KEYS.filter((k) => !isStarterAdded(byKey(k), habits, quests))),
  );

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toCreateCount = useMemo(
    () => STARTER_TASKS.filter((t) => selected.has(t.key) && !addedKeys.has(t.key)).length,
    [selected, addedKeys],
  );

  const finish = useCallback(
    async (keys: string[]) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setBusy(true);
      try {
        const created = await applyStarterTasks(keys, habits, todayStr, {
          createHabit,
          createQuest,
        }, quests);
        if (created.length > 0) setShowAllTileNames(true);
      } catch (e) {
        // A rejected write must not escape the async onPress: surface it and
        // still hand off, or the intro user is stranded on the picker.
        console.error('Failed to apply starter tasks:', e);
        emitError("Some starter tasks couldn't be created. Check your connection and try again.");
      } finally {
        setBusy(false);
        finishingRef.current = false;
      }
      // Intro: hand off to the spotlight tour (gated on having a habit).
      if (isIntro) startGenesis();
      router.back();
    },
    [habits, quests, todayStr, createHabit, createQuest, setShowAllTileNames, isIntro, startGenesis],
  );

  const core = STARTER_TASKS.filter((t) => t.category === 'core');
  const more = STARTER_TASKS.filter((t) => t.category === 'more');

  const primaryLabel = isIntro
    ? 'Continue'
    : toCreateCount > 0
      ? `Add ${toCreateCount}`
      : 'Done';

  // Intro setup must end with at least one habit — count what already exists
  // plus what's selected-and-not-yet-added. A custom habit created via the
  // "create your own" button lands in `habits`, so it counts here too.
  const willHaveHabit = habits.length + toCreateCount > 0;
  const canFinish = !isIntro || willHaveHabit;

  if (page === 'welcome') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          <View style={styles.welcomeWrap}>
            <View style={styles.welcomeBody}>
              <ThemedText style={[styles.welcomeEyebrow, { color: colors.tint }]}>
                ESCAPE FROM HADES
              </ThemedText>
              <ThemedText style={styles.welcomeTitle}>Welcome, wanderer</ThemedText>
              <ThemedText style={styles.welcomeText}>
                Your mind is an electric forest. The paths you walk every day become the
                roads you take without thinking. This is the game of wearing better paths
                until they become your default.
              </ThemedText>
              <ThemedText style={styles.welcomeText}>
                Let’s set up a few core habits to start the climb. Pick what fits. You can
                change or remove anything later.
              </ThemedText>
            </View>
            <View style={styles.welcomeFooter}>
              <Pressable
                onPress={() => setPage('pick')}
                style={[styles.primaryButton, { backgroundColor: colors.tint }]}
                accessibilityRole="button"
              >
                <ThemedText style={styles.primaryButtonText}>Begin</ThemedText>
              </Pressable>
              <Pressable onPress={() => finish([])} hitSlop={8} disabled={busy}>
                <ThemedText style={[styles.skipLink, { color: colors.icon }]}>
                  Skip for now
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Custom header (no native bar — matches tile-settings). */}
        <View style={styles.header}>
          <Pressable
            onPress={() => (isIntro ? setPage('welcome') : router.back())}
            hitSlop={8}
            disabled={busy}
            style={styles.headerSide}
          >
            <ThemedText style={[styles.headerSideText, { color: colors.icon }]}>
              {isIntro ? 'Back' : 'Cancel'}
            </ThemedText>
          </Pressable>
          <ThemedText style={styles.headerTitle}>Starter tasks</ThemedText>
          <View style={styles.headerSide} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ThemedText style={styles.lede}>
            Pick what you want to track. We add the habit and its quest, and you can
            change or remove any of them later.
          </ThemedText>

          {/* --- The Path (core, opt-out) --- */}
          <ThemedText style={[styles.sectionHeading, { color: colors.tint }]}>The Path</ThemedText>
          <ThemedText style={styles.sectionSub}>
            Core habits that build a sharper mind every day. On by default. Turn off any
            that aren’t for you.
          </ThemedText>
          {core.map((t) => (
            <CoreCard
              key={t.key}
              task={t}
              colors={colors}
              selected={selected.has(t.key)}
              added={addedKeys.has(t.key)}
              onToggle={() => toggle(t.key)}
            />
          ))}

          {/* --- Worthy Pursuits (opt-in) --- */}
          <ThemedText style={[styles.sectionHeading, { color: colors.tint, marginTop: 24 }]}>
            Worthy Pursuits
          </ThemedText>
          <ThemedText style={styles.sectionSub}>All optional. Tap any that call to you.</ThemedText>
          <View style={styles.pillWrap}>
            {more.map((t) => (
              <Pill
                key={t.key}
                task={t}
                colors={colors}
                selected={selected.has(t.key)}
                added={addedKeys.has(t.key)}
                onToggle={() => toggle(t.key)}
              />
            ))}
          </View>

          {/* --- Your Own (any habit type, incl. custom) --- */}
          <ThemedText style={[styles.sectionHeading, { color: colors.tint, marginTop: 24 }]}>
            Your Own
          </ThemedText>
          <ThemedText style={styles.sectionSub}>
            Want something else? Build any habit from scratch — any type you like.
          </ThemedText>
          <Pressable
            style={[styles.createOwnBtn, { borderColor: colors.tint }]}
            onPress={() => {
              setPendingHabitCallback(() => setCustomAdded(true));
              router.push({ pathname: '/tile-settings', params: { mode: 'create' } });
            }}
            accessibilityRole="button"
            accessibilityLabel="Create your own habit"
          >
            <ThemedText style={[styles.createOwnText, { color: colors.tint }]}>
              ＋ Create your own habit
            </ThemedText>
          </Pressable>
          {customAdded && (
            <ThemedText style={styles.customAddedNote}>
              ✓ Your habit is ready. Pick more above, or continue below.
            </ThemedText>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: colors.tileBorder }]}>
          {isIntro && (
            <ThemedText style={styles.footerNote}>
              {!canFinish
                ? 'Pick at least one habit above, or create your own, to continue.'
                : toCreateCount > 0
                  ? 'We’ll add what you picked (plus its quest) and start you off. Change anything later.'
                  : 'You’re all set. Continue to start the tour.'}
            </ThemedText>
          )}
          <Pressable
            onPress={() => finish([...selected])}
            disabled={busy || !canFinish}
            style={[
              styles.primaryButton,
              { backgroundColor: colors.tint },
              (busy || !canFinish) && { opacity: 0.45 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !canFinish }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.primaryButtonText}>{primaryLabel}</ThemedText>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

function byKey(key: string): StarterTask {
  return STARTER_TASKS.find((t) => t.key === key)!;
}

type Themed = (typeof Colors)['light'];

function CoreCard({
  task,
  colors,
  selected,
  added,
  onToggle,
}: {
  task: StarterTask;
  colors: Themed;
  selected: boolean;
  added: boolean;
  onToggle: () => void;
}) {
  const active = selected && !added;
  return (
    <Pressable
      onPress={added ? undefined : onToggle}
      disabled={added}
      style={[
        styles.card,
        { borderColor: active ? colors.tint : colors.tileBorder, backgroundColor: colors.tileBackground },
        active && { backgroundColor: `${colors.tint}14` },
        added && styles.addedDim,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active, disabled: added }}
      accessibilityLabel={task.label}
    >
      <ThemedText style={styles.cardEmoji}>{task.emoji}</ThemedText>
      <View style={styles.cardBody}>
        <ThemedText style={styles.cardLabel}>{task.label}</ThemedText>
        <ThemedText style={styles.cardBlurb}>{task.blurb}</ThemedText>
      </View>
      <SelectionMark active={active} added={added} colors={colors} />
    </Pressable>
  );
}

function Pill({
  task,
  colors,
  selected,
  added,
  onToggle,
}: {
  task: StarterTask;
  colors: Themed;
  selected: boolean;
  added: boolean;
  onToggle: () => void;
}) {
  const active = selected && !added;
  return (
    <Pressable
      onPress={added ? undefined : onToggle}
      disabled={added}
      style={[
        styles.pill,
        { borderColor: active ? colors.tint : colors.tileBorder },
        active && { backgroundColor: `${colors.tint}14`, borderColor: colors.tint },
        added && styles.addedDim,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active, disabled: added }}
      accessibilityLabel={task.label}
    >
      <ThemedText style={[styles.pillText, active && { color: colors.tint }]}>
        {task.emoji}  {task.label}
      </ThemedText>
      {added && <ThemedText style={[styles.pillAdded, { color: colors.icon }]}>✓ Added</ThemedText>}
    </Pressable>
  );
}

function SelectionMark({ active, added, colors }: { active: boolean; added: boolean; colors: Themed }) {
  if (added) {
    return <ThemedText style={[styles.markAdded, { color: colors.icon }]}>Added</ThemedText>;
  }
  return (
    <View
      style={[
        styles.checkCircle,
        { borderColor: active ? colors.tint : colors.tileBorder },
        active && { backgroundColor: colors.tint },
      ]}
    >
      {active && <ThemedText style={styles.checkMark}>✓</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  welcomeWrap: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  welcomeBody: { flex: 1, justifyContent: 'center' },
  welcomeEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  // lineHeight MUST be set: ThemedText's default type injects lineHeight 24,
  // and without overriding it a 30px heavy font clips (tops of letters cut off).
  welcomeTitle: { fontSize: 30, lineHeight: 38, fontWeight: '800', marginBottom: 20 },
  welcomeText: { fontSize: 16, lineHeight: 24, opacity: 0.85, marginBottom: 16 },
  welcomeFooter: { paddingBottom: 20, gap: 14, alignItems: 'stretch' },
  skipLink: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerSide: { minWidth: 56 },
  headerSideText: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 24 },
  lede: { fontSize: 15, lineHeight: 21, opacity: 0.8, marginBottom: 20 },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionSub: { fontSize: 13, lineHeight: 18, opacity: 0.7, marginBottom: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  // lineHeight override needed: ThemedText's default type injects lineHeight 24,
  // which would clip a 26px emoji (same trap as welcomeTitle).
  cardEmoji: { fontSize: 26, lineHeight: 32 },
  cardBody: { flex: 1 },
  cardLabel: { fontSize: 17, fontWeight: '700', marginBottom: 2 },
  cardBlurb: { fontSize: 13, lineHeight: 18, opacity: 0.75 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '800', lineHeight: 16 },
  markAdded: { fontSize: 12, fontWeight: '700' },
  addedDim: { opacity: 0.5 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pillText: { fontSize: 15, fontWeight: '600' },
  pillAdded: { fontSize: 12, fontWeight: '600' },
  createOwnBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  createOwnText: { fontSize: 15, fontWeight: '700' },
  customAddedNote: {
    fontSize: 13,
    fontWeight: '600',
    color: '#27AE60',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  footerNote: { fontSize: 13, opacity: 0.7, textAlign: 'center' },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
