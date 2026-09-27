# Milestone 11.5 — Trailhunt Ride Detail Desktop / Collected

## Goal

Implement the Figma-defined desktop Collected experience within the existing Ride Detail page. Figma frame `44:1492` (**Ride Detail / Collected**) in file `FBH108ct3ahbU7xXiSwdba` is the presentation source of truth. The application remains authoritative for domain logic, APIs, persistence, progression, collectible handling, activity processing, replay, upload, video, and synchronization behavior.

## Scope

- Desktop Ride Detail / Collected only.
- A functional Collected tab alongside the existing Replay tab.
- Real persisted historical collectible events from `GET /api/activities/:id`.
- The shared Ride Detail header, summary, progression panel, loading/error handling, selected activity, and page shell.
- Figma-aligned collected route timeline when historical replay route data is available, collected list/cards, rarity badges, and a factual empty state.

Do not implement Near Misses or Video tab content, World, Progress, Profile, Add Ride redesign, mobile, or any changes to FIT parsing, collectible detection, world queries, progression calculations, replay timing/engine behavior, synchronization, highlight planning, or FFmpeg rendering.

## Figma source

- File: `FBH108ct3ahbU7xXiSwdba` — Trailhunt App
- Selected top-level frame: `44:1492` — **Ride Detail / Collected** (`1359 × 909`)
- Shared detail content: `ActivityDetail`, with a 796 px content column

The selected frame defines the Ride Detail header, summary/progression surface, tab rail, active `Collected (5)` state, `CollectedRouteTimeline`, and a single-column stack of `CollectedItem` cards. Each semantic item includes a `TypeIcon`, collectible name, uppercase type, `RarityBadge`, and value label.

Cards are 79 px high with 16 px padding, 12 px radii, 40 px type-icon tiles, and 8 px stack gaps. Common uses neutral styling; rare uses blue; epic uses purple. The active tab is a 32 px raised surface inside the 42 px tab rail. The selected subtree has no zero-item or hover-state design.

## Data contract and historical truth

`GET /api/activities/:id` already returns a persisted activity with ordered event snapshots:

- activity identity, started time, optional distance/duration, earned XP, found count, and video availability;
- event `id`, `sourceId`, event type, collectible name/type/optional rarity, canonical `value`, latitude, longitude, and `activityTimestamp`; and
- optional versioned replay snapshot containing the historical route and replay inputs.

The Collected UI will use `activity.events`, ordered by the repository's `activity_timestamp, id` sort, as the only source for collected cards. It must never query or reconstruct data from the current world configuration. This preserves the historical name, type, rarity, value, location, and time when the configured world changes or removes a collectible later.

## Data mapping

| Visible value | Classification | Source / behavior |
| --- | --- | --- |
| Found count and Collected tab count | Direct | Persisted activity `collectedCount`. |
| Name, type, optional rarity, value, coordinates, and time | Direct | Persisted ordered activity event snapshots. |
| Rarity/type card styling | Derivable | Snapshot values mapped to canonical presentation tokens. |
| `+… XP` label | Derivable presentation | Stored event `value`, retaining its existing canonical semantics rather than deriving ride or lifetime XP. |
| Timeline marker order, position, and distance labels | Derivable | Historical event time/location plus persisted replay route only when the snapshot is complete. |
| Header distance/duration and progression panel | Direct | Existing persisted activity and player-progress API data via shared components. |
| Ascent, average speed, region, card timestamp/distance, hover states | Unsupported | Omit without creating fields, mocks, or inferred facts. |
| Near Misses and Video content | Intentionally unsupported | Keep tabs present but non-functional. |

## Decisions

- Preserve one `RideDetailPage`; do not create a second Ride Detail page.
- Keep a single loaded activity and current progress in memory while switching Replay and Collected. Do not refetch the activity for a safe local tab change.
- Reuse `RideSummary`, `RideProgress`, `RideTabs`, the existing loading/error handling, and unchanged `ReplayTab` / `mountReplay` behavior.
- Support only canonical rarity tiers: `common`, `rare`, and `epic`. Reuse the established rare/epic design tokens and the existing neutral palette for common.
- Historical events with no stored optional rarity render as neutral cards with no `RarityBadge`; they must not be represented as common.
- Display the stored `event.value` using the Figma-style `+{value} XP` treatment only as the app's existing canonical collectible-event value. Do not calculate, rename, or reinterpret it as ride-local score, activity XP, or lifetime XP.
- For activities with persisted events but no complete replay snapshot, allow Collected to render and preserve the explicit Replay-unavailable state. Omit the route timeline rather than fabricating route data.
- The zero-item state must be factual and lightweight, use the established Figma visual language, and contain no mock collectibles.

## Implementation plan

1. Add selected-tab state to the existing Ride Detail composition. Keep Replay and Collected enabled; retain Near Misses and Video as visible disabled/non-functional controls.
2. Add `CollectedTab` and semantic list/card helpers (`CollectedList`, `CollectedItem`, `CollectibleCard`, and `RarityBadge`) that transform only persisted activity-event snapshots.
3. Render the historical route timeline only when a complete persisted replay route is available; use no current world query and omit the timeline for unavailable historical route data.
4. Refactor the current replay-snapshot guard so it governs Replay alone rather than blocking valid persisted Collected content.
5. Add scoped desktop styles for the active tab, timeline, card density, type icon tiles, rarity treatments, and zero-item state, reusing existing Milestone 11 tokens and adding tokens only when truly reusable.
6. Add focused frontend tests for snapshot rendering/order, rarity/value behavior, empty state, Replay ↔ Collected switching, legacy replay-unavailable behavior, and no-world-query data boundaries.
7. Update the feature record with intentional visual deviations, changed files, and validation outcomes after implementation.

## Expected files

Modify:

- `public/components/ride-detail-page.js`
- `public/components/ride-tabs.js`
- `public/components/ride-detail-page.test.js`
- `public/styles/app-shell.css`
- `public/styles/design-tokens.css` only when a reusable neutral/common token is required
- `README.md`

Add:

- `public/components/collected-tab.js`
- `public/components/collected-list.js`
- `public/components/collected-tab.test.js`

No persistence, database migration, domain model, server API, world-query, replay-engine, upload, video, synchronization, or rendering file is expected to change.

## Acceptance criteria

- Replay and Collected share one activity load and one Ride Detail shell.
- Collected cards use only persisted activity-event snapshots, not `coins.json` or current world configuration.
- Names, types, optional rarity, canonical values, event ordering, and historical truth remain stable after world configuration changes.
- Only `common`, `rare`, and `epic` are styled as canonical tiers; absent rarity remains neutral and unbadged.
- Zero-item rides render a factual empty state.
- Replay → Collected → Replay works without refetching activity detail and replay behavior remains unchanged.
- Legacy replay-less activities show persisted Collected content when available and an explicit Replay-unavailable state.
- Near Misses and Video receive no new implementation.
- Home, Rides, and Add Ride remain functional.

## Validation

1. Run focused Ride Detail, collected-list/card, empty-state, tab-switching, and replay-adapter tests.
2. Run `npm run build` and `npm test`.
3. Run the application with persisted rides and verify Replay → Collected → Replay, fields/order/rarities/values, zero-item behavior, and historical snapshot truth.
4. Verify Home, Rides, and Add Ride.
5. Compare the desktop Collected surface against Figma frame `44:1492`.
6. Report all changed files and intentional deviations: static Figma route-vector art is replaced by data-backed historical route rendering when available; no zero-item or hover state exists in the selected Figma frame, so the project token language will be applied without invented collectible data.

## Implementation record

- Added a local Replay / Collected tab state to the shared Ride Detail shell. Both views reuse the original activity and progress response; only the selected content is rendered locally.
- Added persisted-snapshot-only collected cards, a factual empty state, canonical common/rare/epic presentation, and Figma-exported collectible icons. Events without rarity stay neutral and have no rarity badge.
- Added a data-backed compact historical timeline that uses only the stored replay route and activity-event timestamps. Its markers and distance labels are omitted with the timeline when a complete replay snapshot is unavailable.
- Legacy rides now retain their detail shell: Replay reports unavailable data while Collected continues to show persisted events.
- Changed files: `public/components/ride-detail-page.js`, `public/components/ride-tabs.js`, `public/components/collected-tab.js`, `public/components/collected-list.js`, `public/components/ride-detail-page.test.js`, `public/components/collected-tab.test.js`, `public/styles/app-shell.css`, and the three collectible icon assets.
- Validation: focused Ride Detail / Collected tests, `npm run build`, and `npm test` passed (84 tests passed; 3 database-backed persistence tests skipped because no `TEST_DATABASE_URL` was supplied).
