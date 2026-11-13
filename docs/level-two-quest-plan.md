# Level Two quest: build plan (handoff, 2026-11-12)

Status: BUILT 2026-11-12 (uncommitted, not yet checked on device). Glow rule as built: an upgraded badge's status is measured on goal days only; blue replaces green for strong, gold kept up, red remission (green never shows on an upgraded badge). Also added: tap a quest grid day for a day card (both quests), and a subtle flame beside the STREAK count from a 3-day streak (the label is always just "STREAK"). Later the same day: the Level Two TODAY check became status only, and a once-ever "Ten days strong." card shows at the first 10-day quest streak.

## What the user asked for

- A second quest below the 60-day quest on the Quests tab, called "Level Two" for now.
- Grayed out until the user has at least one badge.
- Same as the 60-day quest, but it only counts level 2 days (goal or ideal). The calendar shows level 1 (basic) days, but they don't count.
- Badge: upgrade the habit's existing patch in place (no second corner badge). A level two badge glows BLUE instead of green when it's succeeding, "so the default view tells you instantly where it is at".
- Tile highlight: a darker, blue-focused foil, same shine as the 60-day rainbow tile, on a SHARED CLOCK so both tiles' shine lines up (user confirmed "shared clock").

Decisions I proposed and the user accepted with "build it":

- Runs alongside the 60-day quest: one of each at a time.
- Pickable habits: already have a badge AND can reach level 2 (`isTieredHabit` in lib/habit-scoring.ts). Boolean and counter habits can't.
- Basic days count as a miss for habit strength and restarts. A full week with no goal day restarts it (user was told this is the harsh part and didn't object).
- If one habit is in both quests, the blue foil wins on its tile.

## Rules that apply (from memory)

- No commits. No worktrees. Never run prettier (no config; hand-format, single quotes, ~100 cols).
- No spring/bounce animation, eased timing only.
- No em dashes in user-facing copy. Plain, direct, imperative copy.
- Science first where there is science. Do NOT invent a study for level two. Reuse the existing `Research` paragraph (it describes the model both quests run on) and say so to the user.
- Don't change the look of existing screens beyond what's asked.
- Don't start/stop the user's dev servers or simulator in ways that disrupt their testing. A UCS Metro may still hold port 8081.

## Plan, file by file

### 1. types/habit-quest.ts
Add `level?: 1 | 2` to `HabitQuest` (absent = 1). firestore.rules for `habitQuests` is owner-only with no field checks, so no rules change.

### 2. lib/habit-quest.ts (+ tests in __tests__/habit-quest.test.ts)
- `didParticipate(habit, record, level = 1)`: level 2 = `recordLevel(habit, record) >= 2`. Level 1 unchanged (including the value-below-first-goal case).
- `quickRecordValues(mode, level = 1)`: level 2 returns `{first:'double', cleared:'no'}` for triple, `{first:'goal', cleared:'no'}` for quad and creativeWriting, null otherwise.
- `QuestDayState`: add `'basic'` = a past day with level 1 participation that didn't reach level 2 (only on a level 2 quest). Today not yet at goal stays `'open'`.
- `computeQuestProgress`: new optional `level` param; `isDone` uses it. In the day layout, a past non-done, non-excused day with `didParticipate(habit, rec, 1)` gets state `'basic'` (still counted in `missedCount`; add `basicCount`).
- `creditedQuest`: new optional `level` param passed through to `isDone` and `questFrom`.
- Tests: level 2 participation per mode, `'basic'` state, a week of basic-only days restarts, credit at level 2, quickRecordValues level 2.

### 3. contexts/habit-quest-context.tsx
- `activeQuest` = active with `(level ?? 1) === 1`; add `activeLevelTwo`.
- `pastQuests` = finished level 1 ONLY (badge numbering in `useEarnedBadges` and `lastBadgeEnd` depend on it); add `pastLevelTwo`.
- `startQuest(habit, startDate, passed?, level = 1)`, `finishQuest(result, level = 1)`, `abandonQuest(level = 1)`: act on the quest of that level; write `level: 2` on the doc.
- Add `celebratedLevelTwoDateRef` beside `celebratedDateRef`.

### 4. hooks/use-habit-quest-progress.ts
`useHabitQuestProgress(level: 1 | 2 = 1)`: picks `activeQuest` or `activeLevelTwo`, passes `level` to `computeQuestProgress`.

### 5. hooks/use-habit-badges.ts
Add to `HabitBadge`:
- `level: 1 | 2`: 2 when the habit has a finished level 2 quest with `finalStrength >= STRENGTH_LINE` (or the active level 2 quest has `earnedBadge`).
- `levelTwoStatus: MaintenanceStatus | null`: same `strengthOver` + `maintenanceStatus` replay but with `didParticipate(..., 2)`.
- Glow rule: blue when `level === 2 && levelTwoStatus === 'strong'`; otherwise the existing level 1 status color (green/gold/red).
- Level Two pick list: badged + `isTieredHabit` + (`level === 1` or `levelTwoStatus === 'remission'`).

### 6. components/habit-quest/holo-foil.tsx
- Add `palette?: 'rainbow' | 'deep'`. Export `DEEP_COLORS` (indigo, royal blue, cyan, violet; e.g. `['#3D2BFF', '#2F6BFF', '#39C6FF', '#7A5CFF', '#1B2FA8', '#5CE1E6']`). Blues are less luminous, so bump wash/band opacity a little for `deep`.
- SHARED CLOCK: today each instance starts its own `drift` and `glare` loops in `useEffect`, so instances drift apart. Replace with module-level shared values per variant (`makeMutable` from react-native-reanimated 4.3.1, exported), ref-counted: start the loops when the first user mounts, cancel when the last unmounts. All instances of a variant read the same `drift`/`glare`. `flash` stays per instance.

### 7. components/habit-quest/badge-patch.tsx, tile-badges.tsx
- `BadgePatch` gets `level?: 1 | 2`. Level 2: edge filled with a blue SVG LinearGradient (indigo to cyan), plus a second dashed stitched ring near the edge. Still blended toward `bg` by `tint`.
- `StatusGlow` gets an optional `color` override; export `LEVEL_TWO_INK` (about `#4FA8FF`). Gradient `id` must include the color so two glows don't share a def.
- `TileBadges` passes `badge.level` and the blue override. Update the accessibility label.

### 8. components/habit-quest/sixty-day-quest.tsx
Parametrize by level with a small `QuestKind` config + React context (title, level, colors, ink, palette) so `StartQuest`, `ActiveQuest`, `HoloCard`, `DayGrid`, `Rules` are shared. Export `LevelTwoQuest`.
- Section: blue title bar, "LEVEL TWO", lede about counting only goal days on a badged habit.
- Locked (no badges): whole card dimmed with "Earn a badge to unlock Level Two." No picker.
- Unlocked, none eligible: "None of your badged habits has a goal level."
- Start: science paragraph first (`Research`), then level two rules, pick list, Begin. Label `BEGIN LEVEL TWO: NAME`; when 60 goal days already pass, `UPGRADE YOUR NAME BADGE`. Don't wire the sticky Begin for this card (the screen's sticky API holds one button).
- Active: `HoloCard` with `palette="deep"`; check writes the level 2 value and remembers the prior value so an un-tap in the same visit restores it; STREAK uses `isRecordGoal`; DAYS = goal days.
- `DayCell`: `'basic'` = habit-color outline with a faint fill. Legend: Goal, Basic, Missed, Vacation.
- Finish: `finishQuest(result, 2)`, then `BadgeEarnedModal` showing the habit's latest badge design at level 2 (add `level` to `EarnedBadge`, kicker "BADGE UPGRADED").
- `YourBadges`: the latest badge row of a level 2 habit shows the upgraded patch, and "Strong at level two" in blue when that applies.
- Level two rules copy (draft, check against the plain-copy rule):
  1. Only days you reach goal or ideal count. A basic day shows on the calendar but counts as a day off.
  2. Habit strength here is measured on goal days alone. It builds and fades the same way.
  3. The quest restarts at day 1 after a full week with no goal day, after a full week under 50% once you've reached it, or as soon as 50% by day 60 is out of reach.
  4. Vacation and win-only days you skip don't use up any of the 60.
  5. It runs alongside the 60-day quest. Reach day 60 at 50% or more and the habit's badge upgrades.
  6. Already hitting goal? Day 1 goes back as far as the quest would have run without restarting, up to 60 days.
  7. An upgraded badge glows blue while you hold 50% at goal. Below that it shows how the habit is holding up at any level.

### 9. components/habit-quest/quest-celebration.tsx, badge-earned-modal.tsx
Add `palette`/`level` to `QuestBurst` and `EarnedBadge` so the level two burst and modal use `DEEP_COLORS` and the deep foil.

### 10. components/habits/tile-grid.tsx + app/(tabs)/(habits)/index.tsx
- TileGrid: add `deepHoloHabitId`, `deepHoloFlashKey`, `deepHoloTileRef`; a tile in both quests renders the deep foil only.
- index.tsx lines ~300-349 hold the 60-day celebration effect. Extract it to a hook (e.g. `hooks/use-quest-day-celebration.ts`) taking the level, and call it twice. Keep the level 1 behavior identical (pending-until-modal-closes, `celebratedDateRef` skip).

### 11. app/(tabs)/(quests)/index.tsx
Render `<LevelTwoQuest revealInScroll={revealInScroll} onCelebrate={setQuestBurst} />` right after `<SixtyDayQuest />`.

### 12. Verify
`npx tsc --noEmit`, `npx jest` (548 pass today), eslint on touched files. Then check in the simulator if it won't disrupt the user's testing; otherwise say it's unchecked. Update memory (`project_sixty_day_quest.md`) with the new invariants.

## Also done this session (all uncommitted)

- Value habit input: typing replaces the starting 0 (lib/number-input.ts, components/ui/quick-input-modal.tsx).
- Quests tab: old Challenges / Eternal Trials / Pacts / "+ NEW" hidden behind `SHOW_LEGACY_QUESTS = false` in app/(tabs)/(quests)/index.tsx.
- 60-day quest: WHY 60 DAYS (science only) and HOW IT WORKS (rules) cards; science first and full-size on the start screen.
