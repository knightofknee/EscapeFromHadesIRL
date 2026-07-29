# Health-app integrations: Peloton, Calm, breathwork, and friends

Status: design thinking, nothing built. 2026-07-26.

DECIDED (Brian, 2026-07-26): habits stay GENERIC. Two automated habits, a
general Mindfulness one and a general Workout-minutes one. No habit is named
after a brand and there are no per-app source filters in v1. Brand names appear
only as "works with ..." listings in starter tasks / creation, and as the
"Receiving from ..." attribution once data flows. See "The sharing chain" for
the connection-reminder + aggregation-explainer UX this implies.

## The core insight: integrate the stores, not the apps

We never need a Peloton API key, a Calm partnership, or an OAuth flow per app.
Almost every major fitness/mindfulness app already writes its sessions into the
platform health store, and we already read from both stores (steps habit):

- iOS: HealthKit
- Android: Health Connect

So "Peloton integration" = read HealthKit workouts, filtered (optionally) to the
ones Peloton wrote. The integration is real at the data layer and cosmetic at the
presentation layer, which is exactly where you want the brand names: on the habit
creation screen and starter picker, where a new user sees "Peloton" and feels at
home, while under the hood it's just a workout-backed tile.

Two properties of the stores make this work:

1. Every sample carries its source. HealthKit samples have a `sourceRevision`
   with the writing app's bundle id and display name ("Peloton", "Calm").
   Health Connect records carry the writing package name. So we can attribute,
   filter, and even auto-detect which apps the user actually uses.
2. Samples of the same type pool into one stream. Calm minutes, Headspace
   minutes, Apple Watch Breathe sessions all land in the same mindfulness
   stream. So the "multiple apps into 1 tile" idea from the brainstorm is not a
   stretch goal, it is the DEFAULT. A tile bound to a data type aggregates every
   app for free; filtering to one brand is the optional narrowing, not the base
   case.

## The landscape: data types x the apps people actually use

Only two data types cover almost everything requested (breathwork, Peloton-style
exercise), and both have the same shape as steps: per-day sessions we can sum
and map onto tiers.

### Mindfulness minutes
iOS: `HKCategoryType mindfulSession` (interval samples, duration = minutes).
Android: Health Connect `MindfulnessSessionRecord` (newer API, verify min SDK).

Apps that write it (iOS, high confidence): Calm, Headspace, Balance, Insight
Timer, Oak, Ten Percent Happier / Happier, Waking Up, Breathwrk, Othership,
Apple Watch Mindfulness (Breathe/Reflect). Breathwork apps almost universally
log as mindful minutes, so "breathwork" and "meditation" are the same stream.

### Workouts
iOS: `HKWorkoutType` (activity type, duration, energy, source).
Android: Health Connect `ExerciseSessionRecord` (exercise type, duration).

Apps that write it (iOS, high confidence): Peloton, Strava, Nike Run Club /
Training Club, Apple Fitness+, Garmin Connect, Whoop, Oura, Zwift, Tonal,
Orangetheory, Future, Runna, AllTrails, Down Dog, Hevy, Strong, Ladder, Sweat.

Workouts give us a second filter axis besides source app: activity type
(yoga, cycling, strength, HIIT, running...). "Yoga" as a habit can mean
"any yoga workout from any app", which is often better than a brand filter.

### Later candidates (park these)
- Sleep (Oura, Whoop, AutoSleep, Eight Sleep): "in bed by X" habits. Different
  shape (day attribution is midnight-crossing), do not lump into v1.
- Water / nutrition (WaterMinder, MyFitnessPal, Lose It, MacroFactor): natural
  counter-mode habits, but nutrition data is noisy and personal. Later.
- Fitbit note: Fitbit does NOT write to HealthKit on iOS (Google ecosystem).
  On Android it writes to Health Connect. Don't promise Fitbit on iOS.

### Android reality check (do this before promising brands)
Health Connect adoption is years behind HealthKit. Peloton, Strava, Fitbit,
Samsung Health, Garmin write to it; the mindfulness apps are spottier, and
`MindfulnessSessionRecord` itself is a recent addition. Before any brand chip
ships on Android, verify on a device that the app actually writes the record
type. The design degrades gracefully: category integrations (workouts,
mindfulness) work wherever the store has data; brand chips are shown per
platform only where verified.

## Data model: one new concept, not seven new modes

Don't add a `peloton` mode and a `calm` mode. Add at most two recording modes
mirroring the steps pattern:

- `workout`: day value = total workout minutes (optionally filtered), plus
  session count.
- Mindfulness: fold into the existing `meditation` mode rather than adding a
  parallel mode. The meditation habit already has sessions, tiers, and a modal;
  HealthKit mindful sessions become externally-sourced sessions merged with the
  in-app timer's. One tile, timer + Calm + Breathwrk together. (This also
  answers "can we hook multiple apps into 1 tile": yes, structurally.)

Per-habit config (v1 keeps it minimal, no source filters):

```ts
// on Habit
workoutGoals?: number[];   // 1-3 ascending minute thresholds, like stepGoals
```

Source attribution (which app wrote each sample) is still read and stored per
day, but only for DISPLAY ("Receiving from: Peloton, Strava") and detection,
never for filtering. Per-app filters and activity-type filters (e.g. a
yoga-only tile) stay parked as a maybe-later; aggregation-by-default is the
product.

Tier mapping IS the three-levels philosophy, automated:
- Level 1 (yes): any session at all. Showed up, even a little.
- Level 2 (goal): daily goal minutes met (threshold 2).
- Level 3 (ideal): the very-successful-day threshold.

Reuse wholesale from steps (see lib/steps.ts, use-steps-backfill.ts):
- confirmed-through pointer + foreground backfill for ended days
- manual always wins (`source: 'manual'` on records)
- permission requested at recording-type select, not app launch

## The sharing chain (why a reminder is required, and the UX for it)

Three switches sit between a Peloton ride and our tile, and we only control
the last one:

1. Source app -> Apple Health sharing. OFF by default in most apps (Peloton,
   Strava, Calm, Headspace all bury a "Connect to Apple Health" toggle in
   their own settings).
2. iOS Health write permission for that app (iOS prompts once, users decline
   or forget).
3. Our read permission (requested at recording-type select, steps pattern).

We cannot read switches 1-2 directly (HealthKit won't even tell us which apps
COULD write), but we can observe their effect: with read permission granted,
zero samples in the last 30 days means the chain is broken upstream. That
signal drives all the UX:

- "How this works" sheet, shown once when a Mindfulness/Workout auto habit is
  created (starter or tile-settings), right after our permission grant. Three
  short lines: we read Apple Health; your apps must be set to share into
  Apple Health (that toggle lives in THEIR settings); everything that shares
  gets added together into one daily total. This is also where the level
  thresholds are stated (any session = Level 1, goal minutes = Level 2, ideal
  = Level 3).
- Empty-chain nudge on the tile's modal (and starter confirmation): "No
  workout data yet. Open your workout app's settings and turn on Apple Health
  sharing." Only shown when permission is granted AND the 30-day query is
  empty, so it never nags a working setup.
- "Receiving from: Peloton, Strava, Watch" line in the habit's modal once data
  flows, built from sample source names. This is the aggregation explainer AND
  the proof the connection works, in one line. Tapping it can open the full
  how-it-works sheet again.

## Presentation

### Habit creation (tile-settings)
The AUTO_MODES tile row (Steps, Meditation) grows by one: Workouts. Generic
tiles only, no brand-named habits. The familiar names still do the selling,
as caption text under the auto tiles: "works with Peloton, Strava, Fitness+
and any app that shares to Apple Health" / "works with Calm, Headspace,
Breathwrk, or our built-in timer". App names as compatibility statements are
nominative use; their LOGOS would be a trademark fight, text only.

### Starter setup (the bubble picker)
Same principle: the existing Exercise and Meditate bubbles gain a small
"works with ..." sublabel. No new flow. Picking them creates the generic
auto-backed habits, then the how-it-works sheet (above) runs once at the end
of setup for whichever auto habits were created.

### Detection-driven suggestions (phase 3, the delight feature)
Once we hold read permission, query the last 30 days and group by source name.
"We found Peloton workouts on this phone" with a one-tap create-the-Workouts-
habit is the smoothest possible story (the habit it creates is still the
generic one). Never request permission just to snoop; only piggyback on data
we already fetch.

## Phasing

1. `workout` mode + HealthKit mindful-session merge into meditation. iOS
   first. All the plumbing is a copy of steps. Includes the how-it-works
   sheet, the empty-chain nudge, and the "Receiving from" line — the sharing
   chain UX is core, not polish.
2. "Works with ..." captions in tile-settings + starter sublabels. Copy only.
   Verify each Android brand against Health Connect before naming it there.
3. Detection suggestions + Health Connect parity where the ecosystem allows.

## Open questions for Brian

- Should auto-recorded workout days be visually marked like auto steps are, so
  taps vs. HealthKit days stay distinguishable?
- Quests: should workout-backed habits feed the existing Exercise base
  challenge automatically? (They will, if the habit is linked like any other.)
- Where else should the how-it-works sheet be reachable from? (Candidate: the
  ? pattern already used by Create Checklist.)
