# Design audit, 2026-11-05

Coarse controls, fixed option sets with no free entry, arbitrary caps, and
navigation into empty ranges. Ranked most user-visible first. Line numbers
are from before the fixes.

**Status (2026-11-05, same day): 20 of 21 fixed, uncommitted, pending device
check. #1 (day view arrows and date jump) was built, then REVERTED at the
owner's direction: the day view header stays exactly as it was. The day view
is for today and yesterday; history lives in the Week and Month views. Only
the spring-to-timing swap and the quick-input step from #1 remain.**
Decisions taken while fixing, settled 2026-11-12: #2's trailing page is
gone as a separate case, since back pages are now rolling months lined up
with today (no days repeat across pages); keyword drag keeps the library's
spring with overshoot clamped, so it cannot bounce (#12; the library takes
no timing config); new note reset caps at 1440 minutes, the window it is
compared against (#6); the Stats months choice is session state (#9);
`functions/src/chore-schedule.ts` without the reminder cap is deployed
(2026-11-06, the compiled code matches the source) (#7). The "Week starts
on" setting lives under Appearance (#10).

## Findings

1. **Day view has no day navigation and no date jump.** `app/(tabs)/(habits)/index.tsx:358` (header), `:180` (swipe). Only one-day swipes with no on-screen hint. Week and Month show arrows; Day shows none. Logging a habit from three weeks ago is 21 swipes. Also `:164` and `:227` use `withSpring` (bounce) against the no-bounce rule. Fix: arrows in the header, date title opens a picker floored at the earliest habit, `withTiming` + ease.
2. **Month back arrow runs forever into months with no data.** `month.tsx:272`. The forward arrow stops at today but backward has no floor; the week strip already derives one from the earliest habit. Stepping back from the current month also passes the trailing page, so the same days show on two consecutive pages. Fix: floor from earliest habit `createdAt`, hide ‹ at the floor, title opens a month picker.
3. **Chore backfill capped at 60 days; older days can only be removed.** `components/chores/chore-sheet.tsx:17` (`CHIP_DAYS = 60`), `:187`. A yearly chore can't be logged on the day it happened if that was 61+ days ago. "Mark done" on a task always logs today (`:122`). Fix: "Pick a date" opening `components/chores/date-calendar.tsx` (exists), also for task done.
4. **Chore history silently drops completions past 30.** `lib/chores.ts:7` (`CHORE_HISTORY_CAP = 30`), `:184`. A daily chore shows days 31 to 60 as not done in the sheet even though they were logged; tapping one evicts another. Nothing justifies 30. Fix: drop the cap or never evict inside the visible window.
5. **Vacation range picker is two one-day-at-a-time steppers.** `components/habits/vacation-range-modal.tsx:32` (`DateStepper`). A trip next month is 30+ taps per side. `DateCalendar` and the native picker already exist. Fix: calendar per side, arrows kept for fine adjustment.
6. **"New note reset" is four fixed chips, no free entry.** `app/(tabs)/(settings)/index.tsx:193`, `hooks/use-fresh-note-reset.ts:6` (`[5, 15, 30, 60]`). Storage already accepts any integer (`:31`). Fix: minutes field beside the chips, like chore-edit's "Every N days".
7. **Chore reminders: fixed "days before" chips and a hard limit of two.** `app/chore-edit.tsx:444`, `functions/src/chore-schedule.ts:32` (`MAX_REMINDERS = 2`), `:35` (`[0,1,2,3,7]`). An annual chore wants 30 days before. The frequency control on the same screen (`chore-edit.tsx:379`) has a free field, so the screen contradicts itself. Fix: free "days before" field bounded by the cycle; raise the reminder limit (server loop at `chore-schedule.ts:51` handles any count).
8. **"Longest Streak" silently capped at 3 years.** `stats.tsx:38` (`STREAK_HISTORY_DAYS = 1095`), card at `:98` has no qualifier. A 4-year streak reads as 1095. Fix: extend the window when a streak hits the edge, or label it.
9. **Stats window is a fixed 18 months; habit title truncates its tier suffix.** `stats.tsx:350`, `lib/habit-stats.ts:13`; `stats.tsx:225` (`numberOfLines={1}` on name + ": Goal"). Fix: tier label in its own element; window choice bounded by oldest record.
10. **Week starts Monday in habits, Sunday in chores.** `hooks/use-habit-records.ts:52`, `components/habits/week-column.tsx:22` vs `components/chores/date-calendar.tsx:9`. Fix: one `weekStartsOn` setting consumed by all four grids and the PDF.
11. **Tile icon input cuts multi-unit emoji; abbreviation label lies.** `app/tile-settings.tsx:675` (`slice(0, 2)` in UTF-16 units breaks flags and skin tones), `:663` (`slice(0, 4)` under "1-2 letters"). `chore-edit.tsx:350` already handles this correctly. Fix: reuse that prefix approach; make label and limit agree.
12. **Reordering by +/- and up/down steppers, not drag.** `app/tile-settings.tsx:1127` (Position), `app/(tabs)/(settings)/index.tsx:413` (Keyword Order, one write per tap). Fix: drag-to-reorder list (draggable-flatlist is already a dependency).
13. **Three fixed colour palettes, no custom colour.** `constants/grid.ts:13` (12 tile colours), `components/habits/success-color-picker.tsx:9` (a different 24). A tile colour can't be reused as a success colour. Fix: one palette plus a custom swatch.
14. **Birthday set with wraparound steppers.** `components/settings/birthday-modal.tsx:54`. Fix: native date spinner, arrows kept.
15. **Note card hides tags past five with no "+N".** `components/notes/note-list-item.tsx:197`. Fix: "+N" chip or wrap.
16. **Quest names truncate to one line while the form allows 100 chars.** `components/quests/quest-card.tsx:81`, `create.tsx:301`; also `sixty-day-quest.tsx:819`. Fix: two lines, badges wrap under.
17. **Arbitrary meditation caps.** `app/tile-settings.tsx:960` (sessions ≤ 20), `:989` (≤ 180 min/session), `:1022` (≤ 600 total); `meditation-timer-modal.tsx:528` (timer ≤ 180). Fix: validate ≥ 1 only, or cap at a day.
18. **Inconsistent name lengths and small fixed limits.** chore name 40 vs task 80 (`chore-edit.tsx:295`), note title 200, quest 100/1000/2000; `REPORT_WEEKS = 4` is on/off only (`lib/month-pdf.ts:32`). Fix: one generous limit per field type; weeks count typed or following months.
19. **Value-habit quick input steps by exactly 1.** `components/ui/quick-input-modal.tsx:56`. For ml or steps ±1 is noise. Fix: step by the first goal when set.
20. **Export Notes filters by tag only.** `app/export-notes.tsx:96`. No date range.
21. **Chores "Clear" deletes every done task after one alert, no undo.** `app/(tabs)/(chores)/index.tsx:48`. The row-level undo pattern exists.

## Verified and justified (not changing)

Goal tiers capped at 3 (matches the 4-level model); quest target days 1 to 7; notes page size 50 with explicit "Search all notes"; popover width 250; word suggestions 3; habit delete as archive with Revive.

## Templates to copy

Chore frequency (`chore-edit.tsx:379`): presets plus a free "Every N days" field. Task due date (`:317`): presets plus a full calendar. Chore emoji (`:346`): free entry plus picker with correct multi-unit handling. Chore row undo in place. Notes "Search all notes" instead of silently searching a partial window.
