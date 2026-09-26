# Post-ride AR POC

Single-container POC for generating a short GoPro clip with animated Coin Collect effects. Upload one FIT file and one original GPS5 GoPro MP4; the app detects a configured location in the FIT track, maps that event onto the video timeline, renders the clip, and provides it for download.

## Features

- [Coin collection](features/coin-collection/README.md) — animate Coin pickups
  with a 2.5D Collect effect, reward, and generated audio Chime.
- [GameEvent instead of Coin](features/gameevent-instead-of-coin/README.md) —
  generalize downstream Coin-passage records into typed game events.
- [HUD](features/hud/README.md) — replace physical-scene Coin visuals with a
  compact, camera-independent route and event overlay.
- [Multi Clip creation](features/multi-clip-creation/README.md) — select detected
  Coin passages and combine them into one chronological highlight video.

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

## Run in Docker

```bash
docker build -t post-ride-ar .
docker run --rm -p 3000:3000 \
  -v "$PWD/coins.json:/data/coins.json:ro" \
  post-ride-ar
```

## Input requirements

- **FIT:** Must contain at least two time-stamped GPS trackpoints.
- **MP4:** Use an original GoPro chapter copied directly from the camera. QuickTime trimming, re-encoding, or export removes the required `gpmd` GPMF metadata track.
- **Telemetry:** This POC supports **GPS5** only. The correct GoPro chapter must cover the FIT coin-passage time.
- **Coins:** `coins.json` contains a nonempty list of Coins with unique `id`,
  `latitude`, `longitude`, `radius_m`, and `value` fields. The minimum `radius_m`
  is **5 m**. The file is read at the start of every job, so coordinate changes do
  not require rebuilding the image.

The app derives the event in three steps:

```text
coin coordinates → FIT track crossing time → GPS5-clock-aligned video second
```

Each detected Coin is represented downstream as a typed `GameEvent` containing
its Coin ID, type, value, coordinates, unrounded FIT entry-crossing
`activityTimestamp`, and millisecond-rounded `videoSecond`. The app lists the
first detected passage for each configured Coin. Select the passages to include,
then download one chronological highlight video. Each event uses a
three-second-before/-after window; overlapping or adjacent windows are merged.
The default output adds a screen-space HUD: a fixed, heading-aligned map of the
current clip segment where the rider moves toward the top and turns with the
route. It includes nearby Coin markers, a subtle north compass, the next detected
Coin and its direct distance, and a brief collection feed. It uses only FIT/GPS
timing and does not depend on camera pose, road geometry, or image analysis.
Source audio is unchanged.

HUD behavior can be configured with `HUD_ENABLED`, `MINIMAP_ENABLED`,
`EVENT_FEED_ENABLED`, `NEXT_ITEM_ENABLED`, `MAP_RANGE_METERS` (default `150`),
`EVENT_FEED_DURATION_SECONDS`, `EVENT_FEED_MAX_ITEMS`, and `HUD_FRAME_RATE`.
Set `SHOW_LEGACY_COIN_OVERLAY=true` to restore the previous centered Coin effect
with its audio behavior; it is disabled by default.

## Operations

Only one telemetry or render job runs at a time. Each job receives a random token
used for status polling and download. Detection releases the renderer while the job
waits for selection; selections expire after 30 minutes by default. Uploads,
telemetry artifacts, and result clips are deleted after 30 minutes. To guard server
resources, at most 20 Coins and 120 seconds of merged output can be selected; set
`MAX_SELECTED_COINS`, `MAX_OUTPUT_DURATION_SECONDS`, `SELECTION_TTL_MS`, or
`JOB_TTL_MS` to override the defaults.

## API

- `POST /api/jobs` multipart fields: `fit`, `video`
- `GET /api/jobs/:token`
- `POST /api/jobs/:token/render` JSON body: `{ "coinIds": ["coin-a", "coin-b"] }`
- `GET /api/jobs/:token/download`
