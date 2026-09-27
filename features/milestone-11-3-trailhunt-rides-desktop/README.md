# Milestone 11.3 Trailhunt Rides Desktop

## Goal

Implement the Figma-defined desktop rides history within the existing Trailhunt application shell. Existing domain, API, persistence, progression, activity processing, replay, world/collectible, upload, video, and rendering behavior remain authoritative; Figma is the presentation source of truth.

## Figma target

- Design file: `FBH108ct3ahbU7xXiSwdba`
- Target frame: `42:3`, **Rides Desktop**, `1359 × 909`
- Shell: `42:6`, **App**
- Main content: `42:60`, **Activities**
- Central content column: `716 px` wide in the `1139 px` main surface

The frame defines a Rides heading and exploration-history subtitle, aggregate ride statistics, and four `ActivityCard` rows. Each card has a 99–100 px `RouteThumb`, date, optional POV indicator, distance, duration, `XPChip`, collectible count/dots, and an optional Found strip with named collectible badges. Card heights are 120 px without the Found strip and 160–164 px with it, with 10 px row gaps.

The target has no date grouping, sorting/filter controls, loading, empty, error, card-hover, selected-card, or Ride Detail prototype state.

## Scope

Implement only desktop Rides:

- A real persisted-activity list inside the existing `MainContent`
- Figma-aligned heading, summary, card hierarchy, spacing, typography, borders, radii, separators, accents, and active Rides navigation state
- Loading, empty, and API-error states using the established Trailhunt visual language
- Clickable ride cards with a real activity-id handoff to a deliberately minimal Ride Detail placeholder

Do not implement Ride Detail content, World, Progress, Profile, an Add Ride redesign, mobile UI, a new game system, or mock ride data.

## Data decisions

`GET /api/activities` is the sole list request. It returns compact persisted activity history in canonical repository order, `created_at DESC, id DESC`:

```ts
{
  id: string;
  startedAt: string;
  distanceMeters?: number;
  durationSeconds?: number;
  xpEarned: number;
  collectedCount: number;
  hasVideo: boolean;
}
```

`GET /api/activities/:id` also returns persisted collectible event snapshots, but Rides must not call it per row.

| Value | Classification | Decision |
|---|---|---|
| Heading and subtitle | Direct static presentation | Use Figma copy. |
| Ride count | Derived | Use list length. |
| Total distance | Derived | Sum defined `distanceMeters` and format in km. |
| Total XP | Derived | Sum `xpEarned`. |
| Total collectibles | Derived | Sum `collectedCount`. |
| Ride date | Direct | Format `startedAt` as the Figma-style uppercase date. |
| Distance and duration | Direct | Use compact list fields; handle missing values explicitly. |
| XP chip | Direct | Use `xpEarned`. |
| POV marker | Direct | Show only when `hasVideo` is true. |
| Collectible count | Direct | Use `collectedCount` without detail fetching. |
| Individual Found names, rarity badges, and coloured rarity dots | Not supported efficiently for the list | Omit; they require per-activity detail requests. |
| Route thumbnail | Not supported | Omit; durable route geometry is not exposed by either activity API. |
| Source type, ascent, average speed, region, and rarity summary | Not supported by the persisted history contract | Omit. |

## Decisions and constraints

- Reuse the existing `AppShell`, `Sidebar`, `MainContent`, sidebar assets, and design-token layer. Do not reproduce the Figma shell.
- Preserve server and repository ordering; do not introduce client sorting or sorting/filter UI.
- Fetch the list endpoint once. Do not create N+1 requests for names/rarities and do not trigger replay or activity processing merely to draw route previews.
- Use a semantic Rides module with `RidesPage`, `RideList`, `RideCard`, `RideMeta`, `RideStats`, and `RidesEmptyState` names where applicable.
- Each card passes its real id to a `ride-detail` selection state. The placeholder may retain it in navigation history but must not fetch activity data or add Ride Detail content.
- Existing tokens cover the required surfaces, typography, borders, radii, and accents. Add `--rides-canvas-background: #0b0c0f` only if visual comparison requires it to represent the Figma Rides canvas separately from Home.
- Do not change FIT parsing, upload flow, activity processing, GameEvent semantics, collectible detection, progression calculations, persistence semantics, replay timing, video synchronization, highlight planning, or FFmpeg rendering.

## Implementation plan

1. Add `public/components/rides-page.js` with the semantic Rides renderers, pure formatting/view-model helpers, compact-list fetch lifecycle, and explicit loading/empty/error states.
2. Render real list data in the repository’s canonical order and derive summary totals without hardcoded Figma values.
3. Add scoped Rides CSS in `public/styles/app-shell.css`, retaining the existing shell and only adding a token in `public/styles/design-tokens.css` when necessary.
4. Update `public/app.js` and `public/components/app-shell.js` to select Rides and hand a selected activity id to the minimal placeholder. Retain Home and Add Ride behavior.
5. Add `public/components/ride-detail-placeholder.js` containing only the selected-id handoff boundary, not Ride Detail content.
6. Retain `public/components/sidebar.js` as the nav source and ensure Rides becomes active when selected.
7. Add focused browserless tests in `public/components/rides-page.test.js` where supported by current Vitest frontend conventions.

## Planned files

Modify:

- `public/app.js`
- `public/components/app-shell.js`
- `public/components/sidebar.js`
- `public/styles/app-shell.css`
- `public/styles/design-tokens.css` only if visual fidelity requires the dedicated canvas token

Add:

- `public/components/rides-page.js`
- `public/components/rides-page.test.js` when dependency-free frontend testing is supported
- `public/components/ride-detail-placeholder.js`

## Acceptance criteria

- Rides renders inside the existing `MainContent`; the existing shell is not duplicated.
- Rides displays only real persisted activities from `GET /api/activities`, with no Figma mock rows.
- List order matches the API’s canonical newest-first repository order.
- The header summary correctly derives count, distance, XP, and collected totals from compact list data.
- A card displays only supported metadata and hands its real id to the temporary detail boundary.
- Loading, no-rides, and API-error states are explicit and visually consistent with the desktop design language.
- Home, Add Ride, and sidebar navigation retain their existing behavior.
- No per-row detail requests, replay processing, route-thumbnail generation, or unrelated domain changes are introduced.

## Intentional visual deviations

- Omit Figma route thumbnails because durable route geometry is unavailable.
- Omit named Found badges, rarity-dot summaries, and other per-event presentation because rendering them would require N+1 detail requests.
- Omit unsupported values including source type, ascent, average speed, region, and rarity summaries.
- Add no Figma-unrepresented sort/filter, grouping, hover, selected, or Ride Detail content.

## Validation

1. Run focused Rides tests and the existing test suite.
2. Run the application against persisted activities and verify real-data, empty, and error states.
3. Verify canonical ordering, aggregate totals, and real id handoff from every ride card.
4. Verify Home, Add Ride, and sidebar navigation remain functional.
5. Compare the desktop screen against Figma frame `42:3`.
6. Report all changed files and intentional visual deviations.
