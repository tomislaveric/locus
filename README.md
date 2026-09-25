# Post-ride AR POC

Single-container POC for generating a short GoPro clip with a static `+100 XP` coin overlay. Upload one FIT file and one original GPS5 GoPro MP4; the app detects a configured location in the FIT track, maps that event onto the video timeline, renders the clip, and provides it for download.

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
MAX_UPLOAD_BYTES=6442450944 PROCESS_TIMEOUT_MS=900000 npm start
```

Open `http://localhost:3000`. The larger limits above support original multi-gigabyte GoPro chapters; use smaller values when appropriate for the deployment.

## Run in Docker

```bash
docker build -t post-ride-ar .
docker run --rm -p 3000:3000 \
  -e MAX_UPLOAD_BYTES=6442450944 \
  -e PROCESS_TIMEOUT_MS=900000 \
  -v "$PWD/coins.json:/data/coins.json:ro" \
  post-ride-ar
```

## Input requirements

- **FIT:** Must contain at least two time-stamped GPS trackpoints.
- **MP4:** Use an original GoPro chapter copied directly from the camera. QuickTime trimming, re-encoding, or export removes the required `gpmd` GPMF metadata track.
- **Telemetry:** This POC supports **GPS5** only. The correct GoPro chapter must cover the FIT coin-passage time.
- **Coin:** `coins.json` contains one active coin with `id`, `latitude`, `longitude`, `radius_m`, and `value`. The minimum `radius_m` is **5 m**. The file is read at the start of every job, so coordinate changes do not require rebuilding the image.

The app derives the event in three steps:

```text
coin coordinates → FIT track crossing time → GPS5-clock-aligned video second
```

The output clip normally spans three seconds before and after the event; it remains at least four seconds long near video boundaries.

## Operations

Only one render job runs at a time. Each job receives a random token used for status polling and download. Uploads, telemetry artifacts, and result clips are deleted after 30 minutes.

## API

- `POST /api/jobs` multipart fields: `fit`, `video`
- `GET /api/jobs/:token`
- `GET /api/jobs/:token/download`
