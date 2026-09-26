# Route-Relevant World Query V1

## Goal

Limit each activity to the small portion of the configured world around its FIT
route before precise collectible detection and presentation. This keeps the
existing local-config world model simple while allowing the world to grow:

```text
World Collectibles
        |
        v
Activity Route Bounding Region
        |
        v
Relevant Collectibles
        |
        v
Precise route/radius detection
        |
        v
GameEvents
```

The coarse world query is an optimization and presentation boundary. It must not
change the established geodesic, outside-to-inside collection semantics.

## Current flow

Each job reads and normalizes the complete `Collectible[]` from `coins.json`
once. The full list is passed to precise passage detection, included in the
FIT-only activity result used by replay, and supplied to the optional video HUD
timeline. The browser replay currently applies its own display-only
route-proximity heuristic, but the server has no reusable route-bounds or world
query boundary. The video HUD's active marker, next-item, feedback, and feed
logic is event-driven even though its timeline carries collectibles.

## Scope

### Included

- Pure route-bounds derivation from FIT `TrackPoint[]`.
- Configurable meter-based padding around those bounds.
- An O(N) inclusive rectangular filter of configured world collectibles that
  preserves collection semantics for each item's configured radius.
- Filtering before existing precise route/radius passage detection.
- Passing the selected world subset to activity replay and video HUD timeline
  serialization.
- Compact job-level counts for total and relevant collectibles.
- Tests and documentation for the boundary and its retained behavior.

### Excluded

- Databases, spatial indexes, geospatial services, external map APIs, map tiles,
  geohash services, Redis GEO, Elasticsearch, or cloud world services.
- Antimeridian-specific behavior.
- Changes to `src/geometry.ts`, radius calculations, crossing interpolation, or
  one-event-per-source collection behavior.
- HUD rendering/state redesign, FIT/GPS5 synchronization changes, highlight
  planner changes, FFmpeg rendering changes, persistence architecture, and UI
  controls for the padding value.

## Decisions

- Add a pure `src/worldQuery.ts` containing only route-bounds derivation, bounds
  padding, and coarse collectible filtering.
- `getRouteBounds(route)` returns no bounds for an empty route and exact
  min/max latitude/longitude bounds for one-point, north/south, east/west, and
  general routes.
- Meter padding converts latitude directly and longitude using the bounds'
  latitude-aware cosine conversion, with a safe near-pole fallback. No
  antimeridian wrapping is required for v1.
- `WORLD_QUERY_PADDING_METERS` is server-only configuration with a default of
  **500** meters. It is not exposed in the UI.
- An empty route has no geographically relevant collectibles.
- The selected subset is used for both detection and presentation, so every
  collected event source remains available to replay and HUD presentation.
- Job diagnostics contain only `totalCollectibles` and `relevantCollectibles`.
  Normal diagnostics do not include route bounds, padding coordinates, or
  collectible locations.

## Implementation plan

1. Create `src/worldQuery.ts` with:
   - `GeoBounds`;
   - `getRouteBounds(route): GeoBounds | undefined`;
   - `padGeoBounds(bounds, paddingMeters): GeoBounds`;
   - `getRelevantCollectibles(allCollectibles, route, paddingMeters): Collectible[]`,
     including each collectible's collection radius in its coarse query extent.
2. Add `WORLD_QUERY_PADDING_METERS` to `src/config.ts` with the existing
   positive-number parser and a 500-meter default.
3. In `src/server.ts`, load normalized world collectibles once per job, derive
   the activity, filter the world through `getRelevantCollectibles`, and pass
   only that subset into the existing `deriveActivityResult` detection path.
4. Add a compact `WorldQueryDiagnostics` contract and `Job.world` data in
   `src/domain.ts`, then persist total/relevant counts as part of job processing
   without exposing geographic details.
5. Ensure `src/activity.ts` returns relevant presentation collectibles plus any
   event source absent from that subset, preserving event ordering, totals, and
   event construction.
6. Supply `ActivityResult.collectibles` to the existing HUD timeline creation
   rather than the complete world list. Keep event-driven HUD state and rendering
   unchanged.
7. Simplify `public/replay.js` to render its server-provided result subset
   directly, preserving the existing fallback marker for an event whose source
   object is absent and removing the duplicate browser-side coarse filter.
8. Document configuration, diagnostics, coarse-then-precise flow, and scope in
   the root README.

## Acceptance criteria

1. Activity route bounds are derived for empty, one-point, and normal routes.
2. Bounds can be padded by a configurable meter distance.
3. Only geographically relevant collectibles are passed to precise detection and
   world-item presentation.
4. Existing geodesic outside-to-inside radius detection remains unchanged.
5. Every collectible referenced by a collected event is retained for
   presentation.
6. Far-away uncollected collectibles do not appear in replay.
7. Activity results, event order, collected counts, and point totals remain
   correct for relevant collectibles.
8. Video mode continues to work and does not create a separate world query.
9. Compact total/relevant collectible diagnostics exist without geographic data.
10. No database, map, or external geospatial dependency is introduced.

## Validation

- Add `src/worldQuery.test.ts` cases for empty routes, one-point routes,
  north/south and east/west bounds, an item inside bounds, an item outside exact
  bounds but inside padding, an item outside padded bounds, and multiple items.
- Extend activity tests to show that filtering retains exact existing passage
  detection, event ordering, and point totals for the relevant subset, and that
  collected sources remain present.
- Extend replay tests to verify that far-away collectibles omitted from the
  supplied result are not rendered; extract a small pure selection helper if
  needed rather than canvas-testing internals.
- Extend HUD timeline tests to verify that the supplied relevant subset is
  serialized unchanged and no second query occurs in video mode.
- Add a narrow server test only if necessary to validate persisted or status
  diagnostics without booting the listener.
- Run the focused world-query, activity, HUD timeline, and replay tests, then
  `npm run build`; run the full test suite if focused tests show cross-pipeline
  contract effects.
