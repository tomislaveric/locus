# Milestone 11.2 Trailhunt Home Desktop

## Goal

Implement the Figma-defined desktop Home content surface inside the existing Trailhunt application shell. Figma is the presentation source of truth; existing domain, API, persistence, progression, activity processing, replay, world-query, upload, video, and rendering behavior remain authoritative.

## Figma target

- Design file: `FBH108ct3ahbU7xXiSwdba`
- Supplied node: `1:2`, named **Home**
- Desktop shell: `1:5`, **App Shell**
- Content surface: `1:59`, **Home Screen**
- Content wrapper: `1:60`, **Home / Content Wrapper**

The design target does not use the literal frame name “Home Desktop.”

## Scope

Implement only the desktop Home screen:

- Player hero and XP progress
- Summary statistics
- Last-ride summary using durable activity data
- Figma-aligned desktop hierarchy, spacing, typography, colors, borders, radii, and accents
- Minimal screen selection so Home is shown by the Home item and the retained legacy workflow is shown by **Add Ride**

Do not redesign or rebuild the Milestone 11.1 AppShell, Sidebar, MainContent shell, or Add Ride UI. Do not implement Rides, Ride Detail, World, Progress, Profile, mobile UI, backend recommendations, or new domain logic.

## Data decisions

### Supported directly

- Player level, total XP, current-level XP, next-level XP, and progress fraction come from `GET /api/player/progress`.
- The most recent completed ride comes from the first newest-first item from `GET /api/activities`.
- Last-ride date, distance, duration, XP earned, collection count, and video availability use that compact activity history item.
- Persisted event snapshots from `GET /api/activities/:id` provide collected names, types, and optional rarity.

### Supported derivations

- Total distance is the sum of defined historical `distanceMeters`.
- Total collected is the sum of historical `collectedCount`.
- Rarity badges and colors derive from persisted canonical rarity/type values.
- “Rare Finds” counts only events marked `rare`; it does not silently include `epic`.

### Intentionally omitted and documented

Do not fabricate values for these Figma elements:

- Historical route geometry and route markers: completed activities persist no track geometry. The existing replay canvas supports transient job routes only.
- Ride name, elevation gain, average speed, near misses, and collection denominator: no durable API data exists.
- Streak: no canonical streak helper/model exists.
- Next Targets, including target selection, distance, direction, climb, and recommendation: no player location or canonical world-target API exists.
- All Rides, View Ride, and See Map destinations: their destination screens are out of scope.

Per the approved decision, omit unsupported route and Next Target regions and document the resulting visual deviations rather than show mock data or temporary placeholders.

## Implementation plan

1. Retain `MainContent` as the only AppShell content mount.
2. Add `public/components/home-page.js` with semantic `HomePage`, `HomePlayerProgress`, `HomeStats`, and `HomeLastRide` renderers. Fetch only the APIs listed above and provide explicit real no-activity states.
3. Add `public/components/add-ride-page.js`, moving the unchanged legacy upload/activity markup and lifecycle behind Add Ride.
4. Update `public/app.js`, `public/components/app-shell.js`, and `public/components/sidebar.js` for minimal client-side selection and active-state behavior. Home is the default; other primary-nav destinations remain out of scope.
5. Update `public/styles/app-shell.css` with semantic Home/Add Ride styles. Preserve the legacy workflow styles in its isolated Add Ride surface.
6. Extend `public/styles/design-tokens.css` only for reusable Figma tokens not already represented, such as reusable radii, subtle border alpha, and rare/epic accents.
7. Add focused browserless tests for Home data transformation and selection where supported by the existing Vitest setup.

## Planned files

Modify:

- `public/app.js`
- `public/components/app-shell.js`
- `public/components/main-content.js`
- `public/components/sidebar.js`
- `public/styles/app-shell.css`
- `public/styles/design-tokens.css`

Add:

- `public/components/home-page.js`
- `public/components/add-ride-page.js`
- `public/components/home-page.test.js` when supported by current frontend test conventions

## Constraints

Do not modify FIT parsing, activity processing, GameEvent semantics, collectible detection, world querying, progression calculation, persistence, replay timing, video synchronization, highlight planning, or FFmpeg rendering. Reuse the current shell and token layer; do not add Tailwind or a second styling system. The Home route preview is read-only if durable route geometry becomes available later; it must not add playback behavior.

## Acceptance criteria

- Home renders inside `MainContent` with live progression and activity data.
- Home shows an intentional no-activity state when no completed activity exists.
- The sidebar Home item selects Home and Add Ride selects the preserved legacy workflow.
- The legacy upload, processing, replay, collectible selection, and rendering flows retain their prior behavior.
- Home uses no Figma mock values as product data.
- Unsupported route, target, and metric data is absent and documented as a visual deviation.
- No out-of-scope destination screen or mobile redesign is introduced.

## Validation

1. Run focused frontend/Home tests and the existing test suite.
2. Run the application with a local database and verify real-data and no-activity Home states.
3. Verify the legacy Add Ride workflow, sidebar selection, and active state.
4. Compare the desktop layout with Figma node `1:2`; record intentional deviations caused by unavailable product data.
