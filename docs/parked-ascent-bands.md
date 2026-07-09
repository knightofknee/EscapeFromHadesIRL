# Parked idea: Quest "Ascent" bands / run-score waypoints

**Status:** REMOVED from the quests screen 2026-07-08 — parked for possible future revival.

## The idea
The quests home showed the run score as a journey out of Hades, in named tiers:
a **waypoint row** under the run-score bar reading e.g. `Shores of the Styx · 41%` /
`next: Elysium Fields at 50%`, **tick marks** on the run bar at the 25/50/75 band
thresholds, and a tappable **"The Ascent" bottom sheet** with a 4-shore ladder
(`you are here` marker) plus a plain-words "how the run is scored" explainer.

The four shores (0/25/50/75%): **Shores of the Styx → Asphodel Meadows → Elysium
Fields → Gates of Olympus**.

## Why it was pulled
User feedback: "the percentage and names just mean nothing to the user… not a
horrible idea, but I don't think it works for now." The band names + "% to next
shore" felt arbitrary/unexplained. The **run score number itself was kept** (user
likes it); only the bands/waypoints/ticks/sheet were removed.

## Revival notes
The math it named is all still real in `hooks/use-quest-scores.ts` (runScore,
runPct, totalAvailable, the ×1/×2/×4 tiers, 18-month = 6× the month). To bring it
back: re-add the code below, re-import into `app/(tabs)/(quests)/index.tsx`, and
re-mount. If reviving, address the core critique first — make the band names/%
mean something concrete to the user (or drop the mythic names for literal ones).

---

## Code (as removed)

### `lib/quest-narrative.ts` — bands + waypoint fn
```ts
export const ASCENT_BANDS = [
  { min: 0, name: 'Shores of the Styx' },
  { min: 25, name: 'Asphodel Meadows' },
  { min: 50, name: 'Elysium Fields' },
  { min: 75, name: 'Gates of Olympus' },
] as const;

/** Current band + next shore & its fixed threshold. Pure derivation of runPct. */
export function runScoreWaypoint(runPct: number): {
  band: string;
  next: { name: string; min: number } | null;
} {
  let i = 0;
  for (let k = 0; k < ASCENT_BANDS.length; k++) {
    if (runPct >= ASCENT_BANDS[k].min) i = k;
  }
  const next = ASCENT_BANDS[i + 1];
  return {
    band: ASCENT_BANDS[i].name,
    next: next ? { name: next.name, min: next.min } : null,
  };
}
```

### `app/(tabs)/(quests)/index.tsx` — wiring (header tap + bar ticks + waypoint row)
```tsx
// state: const [ascentVisible, setAscentVisible] = useState(false);
// header run-score block was a <Pressable onPress={() => setAscentVisible(true)} …>

<ScoreBar
  score={scores.runPct}
  showLabel={false}
  height={6}
  ticks={ASCENT_BANDS.filter((b) => b.min > 0).map((b) => b.min)}
/>

{(() => {
  const wp = runScoreWaypoint(scores.runPct);
  return (
    <Pressable style={styles.waypointRow} onPress={() => setAscentVisible(true)}
      accessibilityRole="button" hitSlop={{ top: 4, bottom: 10 }}>
      <ThemedText style={styles.waypointBand} numberOfLines={1}>
        {wp.band}
        <ThemedText style={styles.waypointPct}> · {scores.runPct}%</ThemedText>
      </ThemedText>
      <ThemedText style={styles.waypointNext}>
        {wp.next ? `next: ${wp.next.name} at ${wp.next.min}%  ›` : 'the highest shore  ›'}
      </ThemedText>
    </Pressable>
  );
})()}

<AscentSheet visible={ascentVisible} onClose={() => setAscentVisible(false)}
  runPct={scores.runPct} runScore={scores.runScore} totalAvailable={scores.totalAvailable} />
```

`ScoreBar` had an optional `ticks?: number[]` prop that drew hairline ticks at
the given percents (removed with this feature since nothing else used it).

### `components/quests/ascent-sheet.tsx` — the full sheet component
```tsx
import { Modal, Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { QuestColors } from '@/constants/theme';
import { ASCENT_BANDS } from '@/lib/quest-narrative';
import { flameColor } from './score-bar';

type Props = { visible: boolean; onClose: () => void; runPct: number; runScore: number; totalAvailable: number; };

const HOW_LINES = [
  'Every active quest is worth points, set by its weekly commitment and its tier. Participation ×1, goal ×2, ideal ×4.',
  'Your run score is the share of those points your rolling averages currently hold. Points drift with the averages. They are held, not banked.',
  'The 18-month window is worth six times the month. The long road dominates.',
  'The 18-month bars count the full window, even the time before you started. They fill as your history grows.',
  'Beginning a new quest raises your MAX, so your percent can dip at first. That is the cost of ambition, not a penalty.',
];

export function AscentSheet({ visible, onClose, runPct, runScore, totalAvailable }: Props) {
  let currentIdx = 0;
  for (let i = 0; i < ASCENT_BANDS.length; i++) {
    if (runPct >= ASCENT_BANDS[i].min) currentIdx = i;
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={styles.content}>
            <ThemedText style={styles.title}>THE ASCENT</ThemedText>
            <ThemedText style={styles.subtitle}>
              Your run score is {runScore} of {totalAvailable} points. That is{' '}
              <ThemedText style={[styles.subtitlePct, { color: flameColor(runPct) }]}>{runPct}%</ThemedText>{' '}
              of the climb.
            </ThemedText>
            <View style={styles.ladder}>
              {[...ASCENT_BANDS].reverse().map((band) => {
                const idx = ASCENT_BANDS.findIndex((b) => b.name === band.name);
                const reached = idx <= currentIdx; const current = idx === currentIdx;
                return (
                  <View key={band.name} style={[styles.bandRow, current && styles.bandRowCurrent]}>
                    <ThemedText style={[styles.bandThreshold, reached && styles.bandThresholdReached]}>{band.min}%</ThemedText>
                    <ThemedText style={[styles.bandName, reached && styles.bandNameReached]} numberOfLines={1}>{band.name}</ThemedText>
                    {current && <ThemedText style={styles.youAreHere}>you are here</ThemedText>}
                  </View>
                );
              })}
            </View>
            <ThemedText style={styles.howLabel}>HOW THE RUN IS SCORED</ThemedText>
            {HOW_LINES.map((line) => (<ThemedText key={line} style={styles.howLine}>{line}</ThemedText>))}
            <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <ThemedText style={styles.closeText}>Back to the climb</ThemedText>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
// styles: overlay (flex-end sheet), sheet (QuestColors.background, top radii, maxHeight 85%),
// ladder rows (bandRow / bandRowCurrent = goldDim, bandThreshold/Reached, bandName/Reached,
// youAreHere gold), howLabel/howLine, closeBtn — see git history for exact StyleSheet.
```

Full original files are also in git history (added earlier in the 2026-07 quests
clarity redesign, then removed 2026-07-08).
