# Milestone 11.4 — Trailhunt Ride Detail Desktop / Replay

## Goal

Implement the Figma-defined desktop Ride Detail Replay experience for a real selected persisted ride. Figma frame `43:1295` is the presentation source of truth; the existing application remains the source of truth for domain logic, APIs, persistence, progression, replay behavior, activity processing, world/collectible logic, uploads, video, and synchronization.

## Scope

- Desktop Ride Detail / Replay only.
- Real activity selection from Rides and deterministic loading through `GET /api/activities/:id`.
- Ride summary, XP/progression panel, visible Ride Detail tabs, and the functional Replay tab.
- Preserve the current replay engine and its timing, event synchronization, markers, score progression, feedback, completion, and controls.
- Explicit loading, not-found, API-error, and replay-snapshot-unavailable states.

Do not implement Collected, Near Misses, or Video content; World, Progress, Profile, Add Ride redesign, or mobile.

## Figma target

- File: `FBH108ct3ahbU7xXiSwdba` — Trailhunt App
- Canvas: `42:1097` — **Ride Detail Desktop**
- Exact frame: `43:1295` — **Ride Detail / Replay**, `1359 × 909`
- Detail content column: 796 px wide, inset 171.5 px within the 1139 px main surface.

The inspected design has:

- A 20 px Back link, 11 px yellow Ride Complete eyebrow, 60 px distance heading, and duration metadata.
- A 796 × 228 XP card with 24 px padding, 12 px radius, `rgba(232,184,10,0.3)` border, and restrained yellow gradient.
- 80 px yellow earned XP, 48 px Found count, a 10 px progress track, and compact current/progress values.
- A 42 px tab rail with active Replay, plus Collected, Near Misses, and Video controls.
- A 796 × 422 dark replay surface with route, rider, collectible markers, and an overlaid 40 px yellow playback button, 6 px timeline, and status label.

Reuse the existing vanilla ES-module templates and CSS token layer. The Figma-generated React/Tailwind reference is not production code.

## Approved decisions

### Canonical historical replay snapshot

Persist an additive, versioned canonical replay snapshot atomically with each completed activity. It retains:

- the canonical route and activity timing;
- the activity-result replay collectible source snapshots;
- canonical near-miss snapshots; and
- the existing persisted event snapshots.

`GET /api/activities/:id` reconstructs the existing `Activity` and `ActivityResult` replay inputs from that snapshot. Historical detail must never depend on transient job state, rerun world queries against a changed configuration, or fabricate Figma values.

If a legacy activity lacks a complete snapshot, Ride Detail reports replay data unavailable. It must not attempt partial replay reconstruction.

### Data mapping

| Visible value | Classification | Product source |
| --- | --- | --- |
| Distance, duration, XP earned, found/Collected count | Direct | Persisted activity detail. |
| Event time/name/type/rarity/value/location | Direct | Ordered persisted event snapshots. |
| Player level, level-progress values | Direct | `GET /api/player/progress` and canonical progression helpers. |
| Current-to-post-ride XP transition | Derivable with caveat | Current total minus selected ride XP is not a historical transition after subsequent rides; do not present it as historical fact without a transition snapshot. |
| Route, rider, source markers, near misses, replay feedback/score/control behavior | Direct after snapshot migration | Canonical replay snapshot and existing `mountReplay`. |
| Ascent, average speed, region, calories, power, heart rate, Explorer title | Unsupported | Omit cleanly; do not add fields or mock values. |

## Implementation plan

1. Add migration-managed replay snapshot persistence, typed DTOs, repository mapping, API response shape, and tests that reconstruct a historical replay without recomputation.
2. Replace the Ride Detail placeholder with `RideDetailPage`, keyed by the selected persisted activity id, with a Back route to Rides.
3. Add semantic `RideSummary`, `RideProgress`, `RideTabs`, `ReplayTab`, `ReplayCanvas`, and `ReplayControls` components, consolidating files only when that matches the project’s small-module conventions.
4. Fetch persisted activity detail and canonical current player progress in parallel; render only verified fields.
5. Use `public/replay.js` unchanged as the behavior engine. The detail layer supplies its existing canvas/UI contract and owns only markup, fetch lifecycle, binding, and Figma-aligned styling.
6. Keep Collected, Near Misses, and Video tabs visible but non-functional; do not create fake tab content.
7. Add scoped desktop CSS using the existing dark surfaces, yellow accent, muted text, borders, radii, Barlow Condensed, and DM Mono tokens. Extend tokens only for reusable inspected values.
8. Document intentional deviations, all changed files, and validation outcomes.

## Expected files

Modify:

- `public/app.js`
- `public/components/app-shell.js`
- `public/components/rides-page.js`
- `public/components/ride-detail-placeholder.js` (replace or remove)
- `public/styles/app-shell.css`
- `public/styles/design-tokens.css` only when required
- `src/domain.ts`
- `src/persistence/activityRepository.ts`
- `src/persistence/migrations.ts`
- `src/server.ts`
- related persistence tests

Add:

- `public/components/ride-detail-page.js`
- `public/components/ride-detail-page.test.js`
- `public/components/ride-summary.js`
- `public/components/ride-progress.js`
- `public/components/ride-tabs.js`
- `public/components/replay-tab.js`

## Constraints

- Do not modify FIT parsing, activity processing, GameEvent semantics, collectible detection, world querying, progression calculations, replay timing, video synchronization, highlight planning, FFmpeg rendering, or upload behavior.
- Do not create a second replay implementation or alter `mountReplay` behavior for visual similarity.
- Preserve activity/event/XP transaction guarantees; replay snapshot persistence is part of the same atomic completion transaction.
- Do not use mock ride data, unsupported metrics, or transient job data as fallback.
- Keep Home, Rides, and Add Ride behavior unchanged.

## Acceptance criteria

- A Rides card opens the detail screen for its exact persisted id.
- Summary and progression display only canonical real data.
- A newly persisted ride replays with the existing timeline, route, rider, markers, event feedback, score, completion behavior, and controls unchanged.
- Legacy/incomplete snapshots report an explicit unavailable state.
- Unsupported fields are absent rather than invented.
- Replay is visually aligned with Figma frame `43:1295`; non-Replay tabs are visible with no fake content.
- Home, Rides, and Add Ride remain functional.

## Validation

1. Run focused frontend and replay-adapter tests plus database-backed snapshot persistence tests.
2. Run `npm run build` and `npm test`.
3. Run the app with a persisted ride; verify Rides → correct id → real summary → Replay.
4. Verify replay timing, collectible event times, markers, feedback, score, completion, and Play/Pause/Restart remain consistent with the current Add Ride replay.
5. Verify loading, missing activity, API error, and snapshot-unavailable states.
6. Verify Home, Rides, and Add Ride.
7. Compare visually against Figma frame `43:1295`; report intentional deviations and every file changed.

## Implementation notes

- Completed activities now atomically persist a versioned JSON replay snapshot containing the canonical activity, route, result, collectible sources, near misses, and event snapshots. Detail reads use that snapshot directly; activities created before the migration explicitly report replay data unavailable.
- Rides now open the selected persisted activity detail. The page fetches activity detail and current player progression concurrently, retains only verified distance, duration, XP, found count, and level-progress values, and mounts the existing `mountReplay` engine unchanged.
- The current player total is displayed only as current level progress. It is intentionally not presented as a historical before/after XP transition, since later rides may have changed it.
- Replay, Collected, Near Misses, and Video remain visible on the Figma-aligned rail; only Replay is implemented. The route canvas remains live rather than using the Figma's static route-vector artwork, so its existing markers, timing, feedback, score, completion, and controls remain authoritative.

### Changed files

- `src/domain.ts`
- `src/persistence/migrations.ts`
- `src/persistence/activityRepository.ts`
- `src/persistence/activityRepository.test.ts`
- `public/app.js`
- `public/components/ride-detail-page.js`
- `public/components/ride-detail-page.test.js`
- `public/components/ride-summary.js`
- `public/components/ride-progress.js`
- `public/components/ride-tabs.js`
- `public/components/replay-tab.js`
- `public/styles/app-shell.css`
- `public/assets/ride-detail-back.svg`
- `public/assets/ride-detail-play.svg`

### Validation outcome

- `npm run build` passes.
- `npm test` passes: 80 tests passed; the 3 database-backed persistence tests are skipped without `TEST_DATABASE_URL`.
