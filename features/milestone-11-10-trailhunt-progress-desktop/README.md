# milestone-11-10-trailhunt-progress-desktop

## Goal

Implement the approved Figma Progress Desktop at node `42:562` as a read-only
Trailhunt surface. Figma is the presentation source of truth; the existing
progression, player state, activities, collectible history, APIs, and persistence
remain the product source of truth.

## Scope and constraints

- Build only **Progress Desktop** inside the existing AppShell/Main Content.
- Preserve the Figma hierarchy: Progress heading, exploration subtitle, inline
  lifetime summary, vertical level journey, focused current-level panel, and
  Recent Rides. Do not turn the summary into dashboard cards.
- Preserve current product/domain naming: Ride, Rides, Ride Detail, Recent Rides,
  Add Ride, and existing ride-related code names remain unchanged.
- Do not add achievements, quests, regions, streaks, currencies, rewards, skill
  trees, unlocks, or a new progression system.
- Do not modify FIT parsing, activity processing, events, detection, XP awards,
  thresholds, persistence transactions, replay, World, video synchronization,
  highlight planning, rendering, or late video attachment.

## Canonical data decisions

- `ActivityRepository#getProgress` and `GET /api/player/progress` remain the
  canonical player-progress source. `getLevelProgress` supplies total XP, current
  level, current-level XP, next-level XP requirement, and progress-to-next-level.
- Displayed completed and future cumulative level thresholds will come from an
  exported, tested canonical progression helper. UI code must not recreate the
  curve or copy Figma mock thresholds.
- Current-level progress uses the canonical `progressToNextLevel`, clamped only
  for visual width. Remaining XP is `nextLevelXp - currentLevelXp`, clamped at
  zero for display.
- Lifetime distance derives from the default player's persisted activity-distance
  sum and is formatted as kilometers with at most one decimal.
- Lifetime collectibles use distinct discovered `activity_events.source_id`, the
  established World discovery identity—not raw event count or activity
  `collected_count`.
- “Rare or better” uses distinct discovered source IDs with only canonical
  persisted `rare` or `epic` rarity.
- Recent Rides use persisted activity `startedAt`, `distanceMeters`,
  `collectedCount`, and `xpEarned`. Their XP display uses persisted `xp_earned`
  and their mini-bar is presentation-only.
- Activities have no persisted ride-name field. Recent Rides will use the
  established deterministic date-based presentation label rather than Figma mock
  names or new persistent titles.

## Level labels

Adventurer, Explorer, Pathfinder, Trailblazer, and Waymaker are Figma
presentation labels, not canonical domain data. Use an isolated deterministic,
Figma-inspired presentation-only mapping for known levels and `Level N` as the
neutral fallback. The mapping cannot affect thresholds, rewards, persistence, or
player state.

## Implementation plan

1. Add a read-only progress dashboard projection in the domain/repository/API:
   canonical progression, SQL lifetime aggregates, and the newest four compact
   activities. It must avoid client-side history scans and per-activity requests.
2. Add a `ProgressPage` module with `ProgressSummary`, `ProgressJourney`,
   `CurrentLevel`, `LevelStep`, `RecentRides`, and `RecentRide` helpers. Generate
   up to two completed levels, the current level, and three future levels around
   any canonical current level; Level 1 remains valid without prior rows.
3. Add the Progress route to existing app routing and navigable screens so the
   existing sidebar Progress item activates.
4. Add focused CSS using the existing Milestone 11 tokens and Figma’s desktop
   spacing, typography, borders, radii, gold accent, completion green, and
   subdued future states. Add only a success-green token if required.
5. Provide loading, API-error, no-history, and new-player states without mock
   rides or mutations. Keep the design desktop-first while compatible with the
   shared shell’s overflow behavior.

## Acceptance criteria

- All Progress values are real and canonical: total XP, current level,
  current-level XP, next-level requirement, progress, remaining XP, thresholds,
  distance, unique collectibles, rare-or-better discoveries, and recent ride XP.
- Completed/current/future level rendering is derived solely from current player
  level and canonical thresholds; no persisted UI flags exist.
- Opening Progress performs no player/activity/progression mutation and no N+1
  detail loading.
- Existing Home, Rides, Ride Detail tabs, World, and Add Activity behavior
  remains intact.

## Validation

- Unit-test canonical threshold exposure and existing progression behavior.
- Repository-test projection aggregation, uniqueness/rarity semantics, bounded
  order, absent distances, and read-only state.
- UI-test canonical progress values, clamping, remaining XP, level states,
  persisted ride XP, no-history/error states, and navigation activation.
- Run the complete test suite and build. Start the app, verify live Progress
  values and other existing screens, compare with Figma node `42:562`, and report
  any intentional deviations plus every added/modified file.
