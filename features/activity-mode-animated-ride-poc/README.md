# Activity mode animated ride POC

## Goal

Make the FIT-derived **Activity → Route → GameEvent[] → ActivityResult** model
the primary product flow while preserving the existing working GoPro highlight
pipeline as an optional presentation layer.

A rider must be able to upload only a FIT file, process the route, collect
configured collectibles, receive points, see the completed-ride result, and
replay the ride as a timestamp-faithful animated route. When an original GoPro
video is also uploaded, the same activity events must continue to drive
synchronization, event selection, HUD rendering, FFmpeg highlight rendering,
and output validation.

## Scope

The feature will:

- derive an in-memory `Activity` from FIT route points;
- reuse the configured coin/collectible loader and existing first
  outside-to-inside radius-crossing detection;
- create complete game events before any video work;
- derive an `ActivityResult` containing route measurements, collected count,
  total points, and events;
- accept FIT-only uploads as a successful product state;
- provide a local, dependency-free browser Canvas replay with route geometry,
  rider progress, collectible state, score, and event feed;
- retain FIT-plus-GoPro upload and video highlight behavior.

The feature will not add database persistence, Garmin/Strava, OAuth, accounts,
social features, progression, map tiles, map providers, challenges, rarity,
respawns, or a generic shared rendering framework.

## Current architecture and boundary

The current server flow requires a FIT and an MP4:

```text
FIT route -> collectible detection -> passage timestamps
  -> GoPro GPS5/GPMF clock extraction -> activity-to-video mapping
  -> GameEvent[] with videoSecond -> HUD timeline / highlight plan / FFmpeg
```

FIT parsing, route representation, coin configuration, geodesic distance, and
first-entry detection are activity-domain behavior. GPMF extraction,
synchronization diagnostics, HUD video timelines, highlight planning, FFmpeg
rendering, and output validation are video behavior.

The feature changes the boundary to:

```text
FIT -> Activity -> RoutePoint[] -> GameEvent[] -> ActivityResult
                                       |             |
                                       |             +-> animated activity replay
                                       +-> optional video synchronization
                                              -> videoSecond enrichment
                                              -> highlight plan / video renderer
```

`src/domain.ts` currently requires `GameEvent.videoSecond`; this will become
optional. Video-only consumers will explicitly narrow to mapped events rather
than making activity events depend on a camera.

## Domain decisions

- Keep `TrackPoint` as the only route-point model. Its timestamp remains epoch
  milliseconds for compatibility with FIT parsing and synchronization.
- Add `Activity` with an ID, FIT source, started/ended timestamps, route,
  optional distance, and optional duration.
- Add `ActivityResult` with activity ID, optional distance and duration,
  collected count, total points, and the canonical events.
- Preserve the current `coin` game-event discriminant, coin ID/event ID,
  location, value, and interpolated `activityTimestamp`.
- Keep `ActivityResult.events` as the canonical activity events, ordered by
  ascending `activityTimestamp`. Video synchronization may produce mapped
  copies with `videoSecond`; it does not mutate the canonical activity result
  or create a separate activity event model.
- Keep existing coin semantics: first transition from outside to inside a
  configured radius creates one event; a ride starting inside does not collect;
  leaving and re-entering does not create a second event.
- FIT-only zero-collectible rides complete successfully. The existing video
  behavior for video jobs with no mappable event remains unchanged; the
  activity result remains available in that failure response.
- A FIT-only activity completes through the existing `succeeded` job state.
  FIT-plus-GoPro jobs retain `processing -> awaiting_selection -> rendering ->
  succeeded`. A result discriminator/mode distinguishes activity-only results
  from video results; no activity-specific terminal job state is added.
- The completed-ride response contract explicitly includes the result
  discriminator/mode and an `ActivityResult`. Route data needed by the replay
  is delivered once with the completed result, not repeated in every job-poll
  response.
- Distance and duration are displayed with an explicit unavailable value when
  omitted, while collected count, total points, and event feed remain present.

## Replay decisions

The replay uses only `TrackPoint` route geometry—no external tiles or map
provider.
Browser Canvas rendering will show the full route, completed route, rider
marker, available/collected collectible markers, simple ride stats, score, and
event feed.

Progress follows `TrackPoint.timestampMs`, with interpolated rider positions;
points are not animated at equal speed. Route coordinates use an
equirectangular local projection, route bounding box, aspect-ratio preserving
fit, and viewport padding.

Replay duration is
`clamp(activityDurationSeconds / 120, 12, 30)`: a 12-second minimum and
30-second maximum. It produces 12 seconds for a 20-minute ride, 22.5 seconds
for a 45-minute ride, and 30 seconds for rides of an hour or longer. Controls
are Play, Pause, and Restart only. Score begins at zero and must equal
`ActivityResult.totalPoints` at replay completion.

Collected-event markers are always rendered. Visible uncollected collectible
markers are restricted to configured collectibles inside or near the route
bounding box; the replay does not render every configured world collectible.

For FIT-plus-GoPro jobs, the UI will show the same ActivityResult before the
existing highlight-selection experience.

## Implementation plan

1. Add `src/activity.ts` with pure Activity, collectible GameEvent, and
   ActivityResult derivation functions. Reuse `parseFitTrack`, `readCoins`,
   `detectFirstCoinPassages`, and `distanceMeters`.
2. Extend `src/domain.ts` with Activity and ActivityResult types, optional
   `GameEvent.videoSecond`, and persisted job fields for activity output.
3. Refactor `src/server.ts` so the shared stage parses FIT, loads coins, derives
   activity/events/result, and succeeds for FIT-only uploads. For MP4 uploads,
   retain current probing, GPS5 extraction, synchronization diagnostics, event
   mapping, HUD-timeline creation, selection, and rendering.
4. Add a discriminated completed-result response. FIT-only jobs transition from
   `processing` to `succeeded`; video jobs retain `awaiting_selection`,
   `rendering`, and `succeeded` states. Return replay route data only with the
   completed activity result rather than every polling response.
5. Make video consumers (`src/highlightPlanner.ts`, `src/video.ts`, and
   `src/hud/timeline.ts`) explicitly accept only finite mapped video events at
   their boundary. Preserve their current video-time contracts and errors.
6. Add `public/replay.js` as a small browser ES module for replay-time mapping,
   timestamp interpolation, local projection, route fitting, event state, and
   score state. Use it from `public/app.js`.
7. Update `public/index.html` and `public/app.js` to make MP4 optional, render
   an activity summary/event list with unavailable measurement fallbacks, mount
   the replay, and retain the existing video selection, synchronization,
   polling, and download UI.
8. Add activity-domain and browser replay tests; update existing video tests
   only as required to keep mapped-event expectations explicit.

## Expected files

| File | Planned change |
| --- | --- |
| `src/domain.ts` | Activity/result types, optional video time, job result fields. |
| `src/activity.ts` | New pure activity, event, and result derivation. |
| `src/activity.test.ts` | Activity/event/result semantics and totals. |
| `src/server.ts` | FIT-only orchestration and optional video enrichment. |
| `src/highlightPlanner.ts` | Safe mapped-event narrowing. |
| `src/video.ts` | Video render boundary validation for mapped events. |
| `src/hud/timeline.ts` | Explicit video-only event validation/narrowing. |
| `src/*.test.ts`, `src/hud/*.test.ts` | Contract and regression updates. |
| `public/index.html` | Optional MP4 input and activity/replay containers. |
| `public/app.js` | Activity result UI while retaining video interactions. |
| `public/replay.js` | Replay timing, projection, state, and Canvas rendering. |
| `public/replay.test.js` | Replay timing, projection, event, and score tests. |

## Acceptance criteria

1. A user can upload and process a FIT file without video, GPMF, FFmpeg, or a
   highlight plan.
2. FIT processing produces an Activity, route, activity-timed GameEvents, and
   ActivityResult.
3. FIT-only GameEvents are valid without `videoSecond`; their timestamps and
   points are preserved.
4. The completed-ride UI displays distance, duration, collected count, total
   points, and collected-event feed.
5. The replay uses route geometry only, follows FIT timestamps, and visibly
   changes collectible state at the corresponding event time.
6. Replay score starts at zero and finishes equal to `ActivityResult.totalPoints`.
7. FIT-plus-GoPro processing continues to enrich the same events with
   `videoSecond`, create a HUD timeline, select highlights, render, validate,
   and download the MP4.
8. No external map service or new runtime dependency is required.
9. FIT-only jobs transition from `processing` to `succeeded`; FIT-plus-GoPro
   jobs retain the existing selection and rendering transitions, and completed
   responses use a discriminator/mode to identify their result.
10. Activity events remain ordered by `activityTimestamp`; video mapping does
    not alter the canonical `ActivityResult.events`.
11. Replay always renders collected-event markers and renders uncollected
    collectibles only when they are inside or near the activity route bounds.

## Validation

- Add activity tests for zero, one, and multiple collectibles; count/point
  totals; timestamp preservation; starting-inside behavior; first-entry
  behavior; and no second event after leaving.
- Add replay tests for start/end mapping, interpolated event position,
  `clamp(activityDurationSeconds / 120, 12, 30)` duration behavior,
  projection/fitting, collected-marker visibility, route-bounded uncollected
  marker visibility, and final-score equality.
- Extend video-boundary tests so unmapped events cannot silently reach the HUD,
  highlight planner, or renderer.
- Run focused Vitest suites, `npm run build`, and full `npm test`.
- Preserve the existing video regression coverage in synchronization, GPMF,
  HUD timeline/state, highlight planner, video renderer, output validation,
  and synchronization-validation tests.

## Constraints

Do not redesign the working GoPro pipeline. Do not modify GPMF clock extraction,
synchronization rules, FFmpeg concatenation/output validation behavior, coin
configuration schema, radius semantics, or first-entry detection semantics
except for type-safe integration with the optional video-time field.

No dependency additions are planned: platform Canvas and
`requestAnimationFrame`, existing TypeScript, Vitest, FIT parsing, and
geography helpers are sufficient.
