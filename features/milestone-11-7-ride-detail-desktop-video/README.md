# milestone-11-7-ride-detail-desktop-video

## Goal

Add the desktop **Ride Detail / Video** tab for a persisted FIT-only ride. Attaching
a source video is an optional enhancement to that existing ride: it must reuse its
persisted FIT-derived timing, route, and GameEvents without changing any gameplay
truth, progression, or original ride result.

## Scope

- Implement the Figma-derived Video tab from node `44:2027` in
  `FBH108ct3ahbU7xXiSwdba`.
- Reuse the existing `RideDetailPage`, `RideSummary`, `RideProgress`, `RideTabs`,
  selected activity id, activity loading, and shared loading/error handling.
- Support attaching one video to an already persisted activity; reuse the current
  synchronization, event selection, highlight planner, HUD, and FFmpeg renderer.
- Persist activity-scoped video metadata/state and durable media storage references.
- Provide no-video, upload, sync, selection, render, ready, and failure UI states.

## Out of scope

- World, Progress, Profile, mobile, and unrelated upload redesign work.
- Re-importing FIT files, creating replacement activities, or recalculating XP,
  collectible detection, GameEvents, progression, replay, or historical stats.
- Destructive replacement of an attached source video. A second upload must return
  a clear conflict until a future explicit replacement flow is designed.
- Broadened video codec/container support.

## Design reference

The inspected frame is **Ride Detail / Video** (`44:2027`). It retains the shared
ride header and summary, marks Video as the active tab, and presents a 796px content
column with an approximately 794px by 445.75px dark-gradient video player. Its
completed state contains REC/duration labels, a 56px round play button,
“Auto-Generated Highlights”, real moment/duration metadata, and 46px event rows
with Jump actions.

Use the shared dark language: `#0b0c0f` page background, `#111318` surfaces,
`#ede9e2` primary text, `#6e7279` subdued text, and `#e8b80a` accent. Preserve
the project’s Barlow Condensed and DM Mono typography, borders, and radii.

The source frame supplies only the completed state. It does not define empty,
uploading, syncing, selection, rendering, failure, download, or replacement
states, and its example times, event names, count, duration, and preview must not
be treated as real application data.

`VideoEmptyState` is an intentional product extension: “No video attached to this
ride yet” and optional-video supporting copy with an **Attach Video** CTA using the
existing Trailhunt yellow button language.

## Current architecture and required changes

Today `POST /api/jobs` requires a FIT file and accepts an optional video in the
same transient token/job directory. The flow derives and persists an activity from
FIT, then synchronizes optional video and renders selected highlights. It cannot
target an existing activity. Job metadata, source video, synchronization result,
mapped events, and render output expire with the job directory; PostgreSQL retains
only completed activity snapshots and a post-render video marker.

Implement an additive activity-media representation in the persistence migrations
and `ActivityRepository`:

- one source-video association per activity, guarded by a unique `activity_id`;
- source and output storage keys, filenames/content metadata, durable workflow
  states, duration, structured sync summary/confidence, mapped events or equivalent
  selection data, selected source ids, render result metadata, user-safe errors,
  and timestamps;
- durable filesystem/media storage for source/output files, never MP4 binaries in
  PostgreSQL;
- sufficient persisted FIT-derived route/timestamp information to invoke existing
  sync and HUD/render functions without reparsing FIT or deriving gameplay again.

Introduce a dedicated activity-targeted video route rather than overloading the
combined FIT/video endpoint. It validates the existing activity and current video
rules, persists its media association before asynchronous work begins, and exposes
the durable video projection through `GET /api/activities/:id`. Add scoped status,
selection/render, preview/stream, and download actions only for states where their
assets exist.

Refactor only video orchestration to accept a persisted activity and reuse
`probeDuration`, GPMF extraction, `assessSynchronization`, `mapToVideoSecond`,
`withEventAvailability`, HUD timeline creation, existing selected-event validation,
`buildClipIntervals`, and `renderSelectedClips`. Preserve the canonical highlight
planner and its configured clip policy.

## State model

| Presentation state | Durable source |
| --- | --- |
| No Video Attached | No activity-media record; ride remains complete and valid. |
| Video Uploading | Media created/upload is in progress. |
| Video Syncing | Source stored and sync work is active. |
| Sync Failed | Persisted structured sync failure. |
| Ready for Highlight Selection | Sync succeeded with valid mapped existing GameEvents. |
| Highlight Rendering | Render work is active. |
| Highlight Ready | Durable rendered output is available. |
| Highlight Failed | Persisted render failure; valid media remains intact for retry. |

Map structured sync failures, including `NO_GPMD_TRACK`, `NO_VALID_VIDEO_CLOCK`,
`NO_OVERLAPPING_TIME_RANGE`, and `EVENT_OUTSIDE_VIDEO`, to concise user-facing
status without exposing raw internal diagnostics.

## Integrity decisions

- The activity-targeted endpoint never calls activity derivation/result persistence,
  XP/progression mutation, or collectible detection.
- Existing activity GameEvents supply mapping and selection; no late-upload path
  inserts or mutates event snapshots.
- State changes are transactional and validated to prevent duplicate attachments
  and duplicate renders.
- Source and output storage are separate so retry work cannot overwrite ready
  assets.
- A second source-video upload is rejected with an explicit conflict. Existing
  source/output assets remain untouched.
- A failed synchronization can be explicitly cleared with **Try Another Video**.
  This removes only its failed media record and source artifact, returns the ride to
  the optional-video state, and does not alter activity, event, XP, or progression
  data.
- Tab switches reuse the already loaded Ride Detail activity and do not refetch or
  reconstruct it.

## Implementation plan

1. Inspect current activity persistence closely and add the smallest durable
   activity-media schema/repository API, including any narrowly required derived
   track/timing persistence.
2. Add late-video upload, durable status, synchronization, selection/render,
   preview, and download endpoints scoped to an existing activity.
3. Extend the existing Ride Detail switch point with `VideoTab` and Figma-aligned
   real-data-driven UI modules: `VideoPlayer`, `VideoEmptyState`,
   `AttachVideoButton`, `VideoUpload`, `VideoProcessingState`, and
   `HighlightReadyState`.
4. Extend focused persistence/API/frontend tests without changing existing replay,
   collected, near-miss, activity, sync, planner, or renderer semantics.

## Acceptance and validation

1. A persisted FIT-only ride opens as valid in the Video tab with **Attach Video**.
2. A valid matching video attaches to that exact activity id without a new activity,
   XP change, collectible-count change, GameEvent duplication, or historical-result
   mutation.
3. Synchronization uses the persisted ride’s FIT-derived timestamps/route and
   preserves current failures and confidence behavior.
4. Existing event selection and highlight rendering use the canonical planner and
   renderer; a completed result persists across reload and supports existing
   view/download capabilities.
5. Replay, Collected, and Near Misses remain unchanged and reuse the same loaded
   activity during tab changes.
6. Video state, source/output references, sync/render results, and ready output
   persist after application reload; no artifact depends solely on job TTL storage.
7. Tests cover activity-targeted no-FIT upload, duplicate/replacement rejection,
   status transitions, reload behavior, and all Video UI states. Run existing tests
   plus the persisted FIT-only/late-attachment workflow and compare the ready state
   with Figma node `44:2027`.
