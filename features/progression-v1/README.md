# Progression V1

## Goal

Make each completed ride contribute to a simple, understandable longer-term
journey:

```text
Activity XP -> Total XP -> Player Level
```

The feature adds only XP and level progression. It must remain lightweight,
motivating, deterministic, and independent of persistence so a later milestone
can choose storage without changing the progression rules.

## Scope

- Treat `ActivityResult.totalPoints` as the XP earned by that activity at the
  progression boundary.
- Derive a player's total XP, level, current-level XP, next-level XP, and progress
  fraction from a non-negative lifetime total.
- Detect level transitions, including activities that cross multiple levels.
- Present ride XP and lifetime progression in the existing completed-ride UI.
- Keep replay score scoped to the currently replayed ride.
- Keep temporary progress in browser memory and apply each completed job once for
  the lifetime of the loaded page.

## Current scoring flow

Collectible configuration validates each value as finite and non-negative.
`src/activity.ts` turns detected passages into `GameEvent` records, then sums their
values into `ActivityResult.totalPoints`. `src/server.ts` retains that activity
result only in a temporary job JSON file. The browser fetches it through
`public/app.js`; the completed-ride stats, video selection, replay feedback, feed,
and replay completion already call this value XP.

The replay derives its score from events up to the current ride timestamp. It
starts at zero and completes at `ActivityResult.totalPoints`. There is no current
player/account/session model, activity history, or durable progress state.

## Decisions

### Canonical XP boundary

`ActivityResult.totalPoints` remains the compatibility-safe activity score and
must not be broadly renamed. The progression layer calls the same value
`xpEarned` when applying an activity. It must not add a duplicate XP value to the
activity result.

### Derived player progress

The implementation will define typed equivalents of:

```ts
type PlayerProgress = {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressToNextLevel: number;
};

type ProgressionResult = {
  previousTotalXp: number;
  xpEarned: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
};
```

Only `totalXp` is source state. Every other player-progress field is derived.

### Level curve

Level 1 begins at 0 XP. Advancing from level `n` to `n + 1` costs `100 * n` XP,
giving the cumulative level threshold:

```text
100 * (n - 1) * n / 2
```

The first thresholds are 0, 100, 300, 600, and 1,000 XP for Levels 1–5. The
curve is intentionally simple, deterministic, and centralized for future tuning.

### Canonical progression helper

Create one dependency-free pure helper module. It will be the exclusive owner of
level mathematics and expose:

- `getXpRequiredForLevel(level)`
- `getLevelForXp(totalXp)`
- `getLevelProgress(totalXp)`
- `applyActivityXp(previousTotalXp, xpEarned)`

The helper validates finite, non-negative XP totals and awards. Invalid values
must fail at the progression boundary rather than silently creating negative
progress.

### Temporary state

No persistence is introduced. `public/app.js` will keep the total XP and the set
of applied job tokens in browser memory. When a completed activity is first shown,
it applies that job's `totalPoints` once, stores the resulting transition, and
reuses it on polling or replay remounts. A page reload begins a new demo session.

## Implementation plan

1. Add `PlayerProgress` and `ProgressionResult` TypeScript contracts without
   changing `ActivityResult`.
2. Create the canonical pure helper for XP thresholds, level lookup, derived
   progress, and activity XP application.
3. In the existing browser activity-result flow, apply the current job's ride XP
   exactly once in browser memory and retain the transition for repeated renders.
4. Add a compact completed-ride progression panel showing:
   - `+540 XP` for the completed ride;
   - `LEVEL 7`;
   - `4,850 -> 5,390 XP`;
   - progress toward the next level; and
   - a restrained conditional `LEVEL UP` display such as `7 -> 8`.
5. Keep the replay unchanged as ride-local scoring: `0 XP` at its start,
   `ActivityResult.totalPoints` at completion, and no lifetime total in its score
   display.
6. Add focused progression tests and regression assertions for existing activity
   and replay scoring behavior.

## Files

| File | Planned change |
| --- | --- |
| `src/domain.ts` | Add progression contracts only; retain `ActivityResult`. |
| `public/progression.js` | Add the canonical pure progression helper. |
| `public/progression.test.js` | Test curve, progress, transitions, and invalid inputs. |
| `public/app.js` | Add browser-memory, once-per-job XP application and result rendering. |
| `public/index.html` | Add compact progression DOM and responsive presentation styles. |
| `src/activity.test.ts` | Assert activity total behavior remains unchanged. |
| `public/replay.test.js` | Assert replay-local score is independent of lifetime XP. |

## Acceptance criteria

1. One canonical XP progression model exists.
2. Level and next-level progress are derived from total XP.
3. An activity applies `ActivityResult.totalPoints` to prior total XP.
4. Level-up transitions detect zero, one, or multiple levels gained.
5. The completed-ride UI can show earned XP, total XP transition, level, and
   progress toward the next level.
6. Replay score remains ride-local and reaches the unchanged activity total.
7. No persistence architecture, reward economy, or expanded game system is added.
8. Existing FIT-only and optional-video activity flows retain their behavior.

## Validation

Test:

- XP threshold calculation, level calculation, and progress percentage;
- zero XP, exact threshold, one XP below/above a threshold, and very large totals;
- one-level and multi-level activity transitions;
- rejected negative or non-finite XP;
- application of an existing `ActivityResult.totalPoints`;
- unchanged activity total derivation; and
- replay score independence from lifetime XP.

Run the focused progression, activity, and replay tests, followed by `npm run
build` and the complete `npm test` suite.

## Constraints and non-goals

Do not change collectible configuration, route query, precise detection,
`GameEvent` semantics, activity total calculation, FIT/video synchronization,
HUD, highlight planning, rendering, upload APIs, job lifecycle, or temporary job
storage.

Do not add persistence, accounts, browser storage, rewards, currency, boosters,
collectible unlocks, inventory, cosmetics, world access, XP multipliers, skill
trees, badges, quests, streaks, seasons, loot, unlock trees, social progression,
or a dashboard.
