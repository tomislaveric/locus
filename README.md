# Post-ride AR POC

Single-container POC for turning a FIT ride into collectible game events and an optional GoPro highlight video. The approved Activity Mode milestone adds FIT-only activity results and an animated route replay while preserving the existing GPS5 GoPro rendering flow.

## Features

- [Activity mode animated ride POC](features/activity-mode-animated-ride-poc/README.md)
  — make FIT activities and game events primary, with a FIT-only replay and
  optional GoPro highlights.
- [Coin collection](features/coin-collection/README.md) — animate Coin pickups
  with a 2.5D Collect effect, reward, and generated audio Chime.
- [GameEvent instead of Coin](features/gameevent-instead-of-coin/README.md) —
  generalize downstream Coin-passage records into typed game events.
- [Highlight planner](features/highlight-planner/README.md) — formalize selected
  game-event timing into a deterministic render manifest before media rendering.
- [HUD](features/hud/README.md) — replace physical-scene Coin visuals with a
  compact, camera-independent route and event overlay.
- [Job lifecycle operational robustness](features/job-lifecycle-operational-robustness/README.md)
  — make local processing jobs lifecycle-safe, isolated, recoverable, and
  retention-aware.
- [Multi Clip creation](features/multi-clip-creation/README.md) — select detected
  Coin passages and combine them into one chronological highlight video.
- [Renderer resilience output validation](features/renderer-resilience-output-validation/README.md)
  — harden highlight rendering with media inspection, timestamp-safe concat, and
  final MP4 validation.
- [Robust sync](features/robust-sync/README.md) — validate the existing FIT/GPS5
  synchronization against manually verified reference events.
- [Synchronization diagnostics](features/synchronization-diagnostics/README.md)
  — make FIT/GPS5 synchronization failures explicit and operationally visible.
- [World Collectible Domain Model V1](features/world-collectible-domain-model-v1/README.md)
  — normalize legacy Coin configuration into reusable world Collectibles with
  canonical event relationships and shared replay/HUD presentation metadata.

## Verified POC result

The POC was validated end-to-end with the selected GPS5 GoPro reference setup:

- the FIT track detects passage through the configured coin, including a passage between two FIT samples;
- the GPS5 clock embedded in the GoPro GPMF metadata automatically aligns the FIT and video timelines;
- a playable, correctly trimmed MP4 with the coin overlay downloads successfully.

The GoPro's **GPS clock** is used for synchronization. A camera position fix is not required: samples are clustered to establish a stable UTC video-start time and discard invalid placeholder timestamps.

## Run locally

Requirements: Node.js 22+ and FFmpeg/FFprobe with H.264 (`libx264`) support.

```bash
cp coins.json.example coins.json
npm install
npm run build
npm start
```

Open `http://localhost:3000`. The default limits allow uploads up to 6 GiB and
processing for up to 15 minutes so that original multi-gigabyte GoPro chapters can
be processed. Override these values with `MAX_UPLOAD_BYTES` and
`PROCESS_TIMEOUT_MS` when necessary.

## Synchronization validation

Run `npm run test:sync` to validate the FIT-to-GPS5 mapping against committed
reference fixtures. Fixture JSON is stored in `fixtures/sync`; media is not
committed. Point `SYNC_FIXTURE_ROOT` to a directory containing the FIT and MP4
paths declared by a fixture:

```bash
SYNC_FIXTURE_ROOT=/path/to/reference-media npm run test:sync
```

Absent media is reported as **SKIPPED**. Available media produces one result per
reference event plus aggregate error metrics; an unavailable event, an out-of-video
mapping, a video-start UTC mismatch greater than 1.5 seconds, or an error above
its tolerance exits nonzero. A corrupt available fixture fails its own events but
does not prevent later fixtures from running or the final aggregate summary from
printing. Pass `-- --debug` to show diagnostics for passing events too.
`SYNC_VALIDATION_TIMEOUT_MS` overrides the 15-minute media-processing timeout.

## Run in Docker

```bash
docker build -t post-ride-ar .
docker run --rm -p 3000:3000 \
  -v "$PWD/coins.json:/data/coins.json:ro" \
  post-ride-ar
```

## Input requirements

- **FIT:** Must contain at least two time-stamped GPS trackpoints.
- **MP4 (optional):** To generate highlights, use an original GoPro chapter copied directly from the camera. QuickTime trimming, re-encoding, or export removes the required `gpmd` GPMF metadata track.
- **Telemetry:** This POC supports **GPS5** only. The correct GoPro chapter must cover the FIT coin-passage time.
- **Collectibles:** `coins.json` remains the default compatibility filename and
  contains a nonempty list of unique Collectibles. Legacy entries with `id`,
  `latitude`, `longitude`, `radius_m`, and `value` normalize to a `coin` named
  after its ID. Rich entries may additionally set a nonblank `name`, `type`
  (`coin` or `landmark`), optional `rarity` (`common`, `rare`, or `epic`), and
  optional nonblank `description`. Coordinates must be finite and in range,
  `radius_m` must be positive, and `value` must be finite and nonnegative. The
  file is read at the start of every job, so coordinate changes do not require
  rebuilding the image.

The app derives the event in three steps:

```text
Collectible coordinates → FIT track crossing time → GPS5-clock-aligned video second
```

Each detected Collectible is represented downstream as a
`collectible_collected` `GameEvent` containing canonical `sourceId`, compact
event-time name/type/optional-rarity presentation metadata, value, coordinates,
unrounded FIT entry-crossing `activityTimestamp`, and millisecond-rounded
`videoSecond`. Its `id` remains a temporary compatibility alias for `sourceId`.
The app lists the first detected passage for each configured Collectible. Select
the passages to include, then download one chronological highlight video. Each event uses a
three-second-before/-after window; overlapping or adjacent windows are merged.
Before rendering, the pure `planHighlights` API creates this deterministic
manifest from selected events: it ignores out-of-video events, deduplicates IDs,
orders equal timestamps by ID, preserves fractional seconds, clamps windows to
the source duration, and reports the merged source duration. The renderer then
resolves each manifest event ID back to its selected `GameEvent` for HUD and
legacy effect rendering.
The default output adds a screen-space HUD: a fixed, heading-aligned map of the
current clip segment where the rider moves toward the top and turns with the
route. It includes nearby Coin markers, a subtle north compass, the next detected
Coin and its direct distance, and a brief collection feed. It uses only FIT/GPS
timing and does not depend on camera pose, road geometry, or image analysis.
Rendered clips always contain a 48 kHz stereo AAC audio track. Source audio is
trimmed and preserved when present; sources without audio receive a generated
silent track so segment concatenation remains safe. Before rendering, the source
must expose a readable H.264 or HEVC video stream with valid dimensions and
duration. The renderer rejects invalid highlight intervals, renders in plan order,
cleans isolated temporary artifacts, and FFprobes the completed MP4. A job fails
rather than exposing an unreadable output, missing video/audio stream, or output
whose duration is outside the renderer's container/encoding tolerance.

HUD behavior can be configured with `HUD_ENABLED`, `MINIMAP_ENABLED`,
`EVENT_FEED_ENABLED`, `NEXT_ITEM_ENABLED`, `MAP_RANGE_METERS` (default `150`),
`EVENT_FEED_DURATION_SECONDS`, `EVENT_FEED_MAX_ITEMS`, and `HUD_FRAME_RATE`.
Set `SHOW_LEGACY_COIN_OVERLAY=true` to restore the previous centered Coin effect
with its audio behavior; it is disabled by default.

## Synchronization diagnostics

Synchronization uses UTC epoch milliseconds throughout. The job status includes a
compact `synchronization` summary with confidence, warnings, overlap, and
available/outside-video passage counts. A valid FIT/GPS5 overlap is required
before highlights are mapped; passages outside the video are classified as
`EVENT_OUTSIDE_VIDEO` and are not rendered.

Processing stops with an actionable code rather than guessing timing when it
finds `NO_GPMD_TRACK`, `UNSUPPORTED_VIDEO_METADATA`, `NO_VALID_VIDEO_CLOCK`,
`INVALID_FIT_TIMESTAMPS`, or `NO_OVERLAPPING_TIME_RANGE`. Set
`FIT_SAMPLE_GAP_WARNING_SECONDS` (default `30`) to report long FIT sample gaps
without reconstructing missing track data.

## Operations

Only one telemetry or render job runs at a time. Each job receives a random token
used for status polling and download. Detection releases the renderer while the job
waits for selection; selections expire after 30 minutes by default. Uploads,
telemetry artifacts, and result clips are deleted after 30 minutes. To guard server
resources, at most 20 Coins and 120 seconds of merged output can be selected; set
`MAX_SELECTED_COINS`, `MAX_OUTPUT_DURATION_SECONDS`, `SELECTION_TTL_MS`, or
`JOB_TTL_MS` to override the defaults.

## API

- `POST /api/jobs` multipart fields: required `fit`, optional `video`
- `GET /api/jobs/:token`
- `GET /api/jobs/:token/activity`
- `POST /api/jobs/:token/render` JSON body:
  `{ "sourceIds": ["collectible-a", "collectible-b"] }`. The legacy
  `{ "coinIds": [...] }` field remains accepted temporarily as an alias.
- `GET /api/jobs/:token/download`
