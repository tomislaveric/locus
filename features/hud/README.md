# HUD

## Goal

Replace the current centered Coin/AR-style visual effect with a compact,
camera-independent 2D game HUD over the output video. The HUD must use the FIT
route, configured Coin locations, and the existing detected event timestamps; it
must not use road-plane detection, scene anchoring, computer vision, camera pose,
perspective tracking, map tiles, or external map APIs.

## Scope

The feature preserves the working FIT parsing, GPS-radius passage detection, GPMF
clock synchronization, selected clip-window construction, per-segment encoding,
and final MP4 concatenation. `coins.json` remains a nonempty list of objects with
only `id`, `latitude`, `longitude`, `radius_m`, and `value`.

The output HUD contains:

- a fixed, heading-aligned local map of the current clip segment on the right side;
- an upward rider marker and route-snapped Coin markers for detected passages in
  the current clip;
- the next uncollected item and its direct GPS distance;
- a compact, top-right event feed for collection events; and
- brief `+value` feedback when an item is collected.

The HUD stays close to the right screen edge with safe margins and does not cover
the center of the footage. It does not add general telemetry such as speed, power,
cadence, or heart rate.

## Decisions

- The map range is configurable and defaults to 150 m.
- The map is oriented once using the riding direction at the start of each clip
  segment, so the rider moves upward through a stable route view. The rider arrow
  follows later turns while a subtle compass indicates geographic north.
- The next item is the next uncollected detected passage in chronological ride
  order. Its shown value is direct Haversine distance from the current interpolated
  rider location to the Coin coordinate.
- HUD collection state and event feed include all detected passages, even if the
  user selected only a subset of those passages as highlight clip anchors.
- Collection markers pulse briefly and disappear once collected. New feed rows are
  added at the top, fade after a configured duration, and are capped at a
  configured count.
- HUD rendering is enabled by default. The legacy Coin visual is disabled by
  default and, if retained, is isolated behind its own feature flag.
- The simplification does not introduce HUD audio behavior; source audio remains
  unchanged unless a later feature explicitly requests sound feedback.

## Architecture

Detection will reuse the parsed FIT track, Coin list, and existing GPMF timing
samples to create a private render-only HUD timeline after detection succeeds. The
timeline holds source-video-timed track samples, configured Coins, and all mapped
`GameEvent` collection events. The job/status payload exposes the same `events`
for browser selection, while the HUD timeline retains every detected event for
collection state and the event feed.

At rendering time, a HUD state is derived from each source-video frame time:

```text
video time
  -> interpolated FIT rider position
  -> fixed, heading-aligned segment route and nearby items
  -> next item, collection state, and recent events
  -> screen-space HUD layers
  -> FFmpeg overlay on the selected source segment
```

Local route/item coordinates use a short-distance equirectangular projection,
followed by one segment-heading rotation and minimap-bound normalization. This
intentionally applies only within the local HUD range and needs no geospatial
library.

The renderer will be modular under `src/hud/`:

- a shared transparent raster/canvas helper;
- `hudRenderer` to coordinate output;
- `miniMapRenderer` for route, rider, and item markers;
- `nextItemRenderer` for next-item text/value feedback; and
- `eventFeedRenderer` for compact collection history.

It will generate compact transparent frame sequences rather than full-frame
graphics, then reuse the existing FFmpeg segment encoder to place a minimap/next
item layer at the right-bottom or right-middle and an event-feed layer at the
top-right. Source video dimensions are probed only to size and place those layers
proportionally.

## Implementation plan

1. Add validated HUD configuration defaults: `HUD_ENABLED`, `MINIMAP_ENABLED`,
   `EVENT_FEED_ENABLED`, `NEXT_ITEM_ENABLED`, `MAP_RANGE_METERS`,
   `EVENT_FEED_DURATION_SECONDS`, `EVENT_FEED_MAX_ITEMS`, `HUD_FRAME_RATE`, and
   `SHOW_LEGACY_COIN_OVERLAY`. Add HUD timeline/state types while retaining the
   existing public detection response.
2. Build a synchronized private HUD timeline during detection from the already
   parsed FIT points, Coin list, and GPMF timing samples. Persist it beside the
   job data and validate/load it at render time.
3. Implement local coordinate projection, rider interpolation, segment-heading
   rotation, local route filtering, nearby item filtering, chronological next-item
   selection, direct distance calculation, collected state, and bounded recent-event
   derivation.
4. Implement the transparent raster HUD renderers: a subtle rounded dark minimap
   panel with thin route line, small item dots, an upward rider marker, compact
   next-item copy, and a top-right fade/move event feed with `+value` feedback.
5. Refactor segment rendering to accept the HUD timeline and feature settings,
   render the layers against absolute source-video time for each merged interval,
   overlay them through FFmpeg, and preserve interval merging, segment codecs,
   source-audio behavior, final output validation, and concat compatibility.
6. Gate the HUD and legacy visual paths through the new flags. The default output
   prioritizes HUD-only visuals without changing detection, selection validation,
   or synchronization.
7. Add focused unit and render-plan coverage, then update root configuration and
   behavior documentation.

## Acceptance criteria

1. FIT parsing, unchanged `coins.json` files, GPS radius detection, event-to-video
   synchronization, clip cutting, and multi-event concatenation still work.
2. A right-side local segment map is derived solely from the FIT route and keeps
   the route fixed while the interpolated, direction-aware rider marker moves
   through it with a north indicator.
3. The route and Coin positions display correctly in local projected coordinates,
   with the route/items rotated once for the segment and the rider marker
   following travel direction through curves.
4. Detected passages in the current clip appear on the map at their interpolated
   route positions and disappear when collected.
5. The next uncollected item and its direct distance display near the minimap and
   switch after collection.
6. All detected collection events produce compact top-right event-feed entries and
   short `+value` feedback using the existing Coin `value`.
7. Feed entries fade after the configured duration and never exceed the configured
   visible count.
8. HUD feature flags work with HUD enabled by default and legacy Coin visuals
   disabled by default, without affecting event detection.
9. The HUD remains screen-space-only, footage-safe, and independent of camera
   model, camera angle, road geometry, and video perspective.

## Validation

- Unit-test projection scale/sign, segment-heading rotation, rider interpolation,
  local-range filtering, direct distance, collection transitions, recent-event
  ordering/duration/count, and disabled feature behavior.
- Retain and run clip-interval merging tests; add HUD FFmpeg input/filter planning
  coverage and targeted render coverage for multi-event merged segments and
  concat-compatible output.
- Run `npm test` and `npm run build`.
