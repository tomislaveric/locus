# Post-ride AR POC

Single-container POC for generating a short GoPro clip with a static `+100 XP` coin overlay. Upload one FIT file and one original GPS5 GoPro MP4; the app detects a configured location in the FIT track, maps that event onto the video timeline, renders the clip, and provides it for download.

## Features

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

Open `http://localhost:3000`. Standardmäßig sind bis zu 6 GiB Uploadgröße und 15 Minuten Verarbeitungszeit vorgesehen, damit originale mehrgigabytegroße GoPro-Kapitel verarbeitet werden können. Beide Werte lassen sich bei Bedarf mit `MAX_UPLOAD_BYTES` und `PROCESS_TIMEOUT_MS` überschreiben.

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

The app lists the first detected passage for each configured Coin. Select the
passages to include, then download one chronological highlight video. Each event
uses a three-second-before/-after window; overlapping or adjacent windows are
merged, and each selected Coin receives its overlay.

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
