# milestone-11-9-trailhunt-add-activity-and-attach-video

## Goal

Deliver a Figma-aligned Add Activity experience and reuse its video-upload
presentation in Ride Detail / Video. FIT import remains the sole source of new
activity gameplay truth; attaching a video enhances an existing persisted ride
without recreating it or changing progression.

## Scope

- Replace the legacy Add Ride presentation with an `AddActivityPage` inside the
  existing application shell and route the sidebar CTA there.
- Create focused shared upload primitives for dropzones, selected files,
  stage-level progress, status, and errors.
- Support required FIT plus optional video for a new activity.
- Support video-only attachment for a persisted FIT-only activity.
- Persist durable activity-media metadata and filesystem storage references,
  including source attachment, sync/render state, mapped events, and rendered
  highlight output.
- Preserve the existing FIT parser, activity derivation, collectible detection,
  GameEvents, progression, replay, synchronization, planning, HUD, and FFmpeg
  rendering behavior.

Out of scope: FIT re-upload during video attachment, a second source video,
replacement/deletion workflows, mobile UI, changing accepted source formats,
and changing any gameplay/progression semantics.

## Figma references

- `44:3982` — **Add Activity / Ready**
- `44:4358` — **Import** overlay
- `44:4359` — import modal container
- `44:4391` — **PrimaryButton** / “View Ride”
- `44:4031` — sidebar Add Ride CTA button

The inspected Figma subtree supplies a static success state: dark backdrop and
modal, check medallion, “Ride Ready”, collectible/XP summary, and yellow View
Ride action. It does not supply upload, validation, progress, error, attachment,
or motion states. Those states will use the existing Milestone 11 token system
and the inspected modal language without claiming unavailable mock content as
product truth.

## Decisions

- A new activity has one required FIT file and an optional video. A FIT-only
  import is fully complete; absence or failure of optional video never invalidates
  the persisted ride.
- A late attachment accepts video only and must reuse the selected persisted
  activity id, its replay snapshot, and its existing GameEvents.
- Activity row, event snapshots, replay snapshot, and XP update commit in one
  transaction. Media creation, synchronization, and rendering are separate
  durable work so media failure cannot roll back gameplay truth.
- An idempotency key identifies one logical import. Repeated UI requests return
  its existing result instead of inserting a second activity, events, or XP award.
- An activity owns at most one canonical source video. A second upload is an
  explicit conflict; it preserves the current source and rendered highlight.
- Media metadata belongs in PostgreSQL while MP4 source/output data belongs in
  durable filesystem/object-style storage outside the temporary job TTL root.
- Interrupted sync/render work must not remain indefinitely active after restart:
  recover it safely or surface an explicit durable retryable failure.
- Progress is stage-level and indeterminate unless actual transport/backend
  progress exists. The UI must not fabricate percentages.

## Shared component model

Use small project-convention JavaScript modules:

- `UploadDropzone`
- `UploadFileRow`
- `UploadProgress`
- `UploadStatus`
- `UploadError`
- `ActivityFileUpload`
- `VideoFileUpload`
- `ProcessingState`
- `AddActivityPage`

`AddActivityPage` composes FIT-required and video-optional controls.
`VideoTab` composes the same video primitives with a required existing activity
id and no FIT control. Native labelled file inputs and buttons remain available
without drag-and-drop; status, progress, and errors use appropriate live/status
semantics.

## Implementation plan

1. Add idempotent, durable import orchestration that invokes the canonical FIT
   pipeline and exposes activity-backed status with the real activity id.
2. Preserve the current atomic repository transaction for activity, GameEvents,
   replay, and XP. Route optional initial video through the durable
   activity-media orchestrator after that transaction succeeds.
3. Isolate durable source/output media from transient job cleanup and extend
   repository/media state operations for safe attachment, recovery, selection,
   rendering, and conflict handling.
4. Build Figma-aligned shared upload primitives and `AddActivityPage`; replace
   the sidebar destination and navigate a successful import to Ride Detail /
   Replay using its persisted id.
5. Refactor Ride Detail / Video to reuse video upload/status presentation,
   preserve its polling behavior, and remove replacement-style failed-sync UI.
6. Remove legacy upload presentation and transient client job flow only after
   functional parity is covered and verified. Keep reusable domain processing.
7. Add focused backend, persistence, and UI tests; update API/documentation
   surfaces affected by the new durable flow.

## State model

| Add Activity | Attach Video |
| --- | --- |
| `IDLE`, `FILES_SELECTED`, `VALIDATING`, `UPLOADING`, `PROCESSING_ACTIVITY`, `PERSISTING`, `VIDEO_SYNCING`, `READY`, `FAILED` | `NO_VIDEO`, `VIDEO_SELECTED`, `UPLOADING`, `VIDEO_SYNCING`, `SYNC_FAILED`, `READY_FOR_SELECTION`, `HIGHLIGHT_RENDERING`, `HIGHLIGHT_READY`, `HIGHLIGHT_FAILED` |

Page-local selection/request state combines with durable import/media state. The
backend remains the canonical source for actual sync, selection, and render
transitions; presentation does not duplicate the processing state machine.

## Acceptance criteria

- FIT-only import creates exactly one activity, persists exactly one event set and
  replay snapshot, awards XP exactly once, and opens the persisted Ride Detail.
- FIT plus matching video uses the existing sync/selection/render behavior through
  durable activity media.
- A failed optional video sync preserves the valid activity, events, replay, XP,
  and progression; Video shows a separate durable failure state.
- Video attachment reuses the exact existing ride id, never requests FIT, never
  creates an activity, and never alters XP/events/stats/progression.
- A second source-video request is rejected without changing source/output media.
- Media state survives reload/restart and never relies on TTL job directories.
- Upload controls are keyboard-accessible and report loading, processing,
  success, empty, and error states without animation-only meaning.
- Home, Rides, World, and all Ride Detail tabs retain their current behavior.

## Validation

- Add tests for FIT-only/FIT+video import, malformed FIT, idempotent retry,
  exactly-once XP/events/activity persistence, returned activity id, and optional
  video failure.
- Add late-video tests for no-FIT upload, id reuse, no gameplay mutation,
  duplicate rejection, sync-failure preservation, restart recovery, durable
  media state, and render output.
- Add UI tests for selected file, loading, processing, success, error, and
  no-video states.
- Run the full suite and TypeScript build, then exercise real FIT-only, matching
  video, failed sync, late attachment, duplicate upload, restart/reload, and
  cross-screen workflows. Compare the available Ready composition with Figma and
  document intentional non-Figma state extensions.
