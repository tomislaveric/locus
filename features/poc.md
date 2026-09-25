# POC Plan: FIT + GoPro to a Coin Clip

## Goal

The POC verifies only this assumption:

> An uploaded FIT file and a matching GPS-enabled GoPro MP4 are sufficient to automatically create a short MP4 clip with a Coin overlay.

The application is a small web app. Users upload exactly one FIT file and exactly
one MP4. A single server container processes the files and then offers the clip for
download.

## Strict scope

| Included in the POC | Not included in the POC |
|---|---|
| One predefined GoPro test device and **one** GPMF stream type read from it (`GPS5` *or* `GPS9`) | Other GoPro models or the other GPMF stream type |
| One FIT file, one MP4, one active Coin | Multiple videos, other cameras, multiple Coins |
| Automatic clock alignment through FIT and GPMF timestamps | Manual synchronization or GPS/position matching as a second validation |
| A static Coin overlay with `+100 XP` | Animation, AR, 3D, or computer vision |
| Anonymous upload and a one-time download | Accounts, history, social sharing, or an admin UI |

The test device and its stream type are determined from the first admissible
reference recording. The POC subsequently supports only that combination.

## Result

The POC was successfully verified with the selected GPS5 GoPro reference ride:

- The FIT passage through the configured Coin is detected, including linear
  interpolation between two FIT trackpoints.
- The GoPro GPS5 clock is automatically aligned with the FIT timestamps.
- The MP4 clip is correctly trimmed around the event, receives a static
  Coin/`+100 XP` overlay, and is downloaded successfully.

The GPS clock in the GPMF stream is sufficient for time alignment. A valid camera
GPS position fix is not required: plausible timestamps are clustered using the
resulting video start time, while placeholder timestamps are discarded.

## Measurable success criterion

For the reference ride, the Coin-passage timestamp in the video is manually
recorded once.

The POC passes when:

1. the application detects the Coin crossing from the FIT file;
2. it automatically maps the crossing time to a video second;
3. that video second deviates by no more than **1.5 seconds** from the recorded
   reference value; and
4. a playable clip can be downloaded.

The clip normally spans three seconds before and after the detected event. When the
event is near a video boundary, the window may be asymmetric but must remain at
least four seconds long.

## Minimal architecture

```text
Browser
  │ Multipart upload
  ▼
One Docker container
  ├─ Small upload/status web page
  ├─ API
  ├─ Temporary job directories
  ├─ FIT parser
  ├─ GPMF extractor for one stream type
  ├─ FFmpeg / FFprobe
  ├─ coins.json
  └─ One background job in the same process
        │
        ▼
Browser: status polling and download
```

- **One container, no external service:** No database, queue, object storage,
  PostGIS, or separate workers.
- **Files:** Every job receives a temporary directory with uploaded files,
  `job.json`, `detection.json`, and the result MP4. A long random job token protects
  status and download endpoints.
- **Coin configuration:** A mounted `coins.json` contains exactly one active Coin
  with `id`, `latitude`, `longitude`, `radius_m`, and `value`. Its radius is at
  least 5 m. The file is read at the beginning of every job, so Coin changes do not
  require rebuilding the image.
- **Capacity:** At most one render job runs at a time. New uploads are clearly
  rejected while the container is busy.
- **Cleanup:** Uploads, intermediate artifacts, and result files remain for at
  most 30 minutes. A simple in-process interval job then removes the entire job
  directory.
- **Minimal protection limits:** Upload-size limits, FFprobe prevalidation, and
  parser and FFmpeg timeouts prevent malformed or oversized files from permanently
  blocking the container. Limits can be increased through environment variables for
  original multi-gigabyte GoPro chapters.

## Technical flow

1. The browser uploads FIT and MP4; the API creates a temporary job directory and a
   job token.
2. FFprobe validates the MP4 container. If the selected GPMF stream is missing or
   the file is invalid, the job ends with a clear error.
3. The FIT parser reads GPS trackpoints sorted by timestamp.
4. The engine examines pairs of consecutive FIT trackpoints that enclose the Coin
   radius. It linearly interpolates the crossing time from distance and timestamp
   between those points. For typical 1 Hz FIT samples and the 1.5-second target, it
   intentionally does not implement a geodetic line/circle intersection.
5. The GPMF extractor reads GPS5 time and relative video time from the `gpmd` track
   for the selected stream type. Plausible GPS timestamps establish a stable UTC
   video start time; a camera GPS position fix is not required.
6. The FIT passage time is mapped to a relative video second using that UTC video
   start time. No clip is created when it falls outside the real video duration.
7. FFmpeg trims the clip and places a static transparent Coin and `+100 XP` overlay
   at the detected time. Source audio is retained when doing so adds no additional
   complexity; audio is not a POC success criterion.
8. FFprobe validates the result MP4. The API marks the job as successful and offers
   the download.

## Work packages

1. **Telemetry verification**
   - Provide an admissible reference GPS GoPro MP4, its matching FIT file, and the
     manually recorded Coin-passage timestamp.
   - Identify the recording's GPMF stream type and read only that stream through a
     suitable extractor.
   - Map FIT time to video time and measure its deviation from the reference value.
   - Verify the FIT/GPMF clock offset as the central assumption. If the deviation
     exceeds 1.5 seconds, investigate the time base, UTC normalization, and stream
     time assignment first; do not prematurely replace the parser.
   - Continue with the web POC only when the deviation is at most 1.5 seconds.

2. **Single-container web POC**
   - Create a Docker container with a small upload/status page, API, FIT parser,
     GPMF extractor, FFmpeg, and FFprobe.
   - Implement multipart upload, random job tokens, status polling, and result
     download.
   - Implement temporary job directories, a single-job lock, upload and runtime
     limits, and scheduled cleanup.

3. **Coin passage and time mapping**
   - Load the single Coin from mounted `coins.json`.
   - Detect two consecutive FIT trackpoints that enclose the Coin radius and
     interpolate the timestamp through distance and time.
   - Map the FIT timestamp to a video second through the stable GPS clock of the
     one supported GPMF stream.
   - Handle only these errors: invalid input, missing supported GPMF stream, no Coin
     passage, unstable GPS clock, event outside video duration, and video too short.

4. **Render the clip**
   - Provide a static transparent Coin/`+100 XP` overlay.
   - Generate a four- to six-second MP4 clip with FFmpeg, including source audio.
   - Validate the result with FFprobe and offer it for download on success.

5. **Prove the POC**
   - Run a browser end-to-end test covering upload, status, automatic time mapping,
     rendering, and download.
   - Compare the detected video second to the manual reference value.
   - Run negative tests for invalid FIT, MP4 without the supported GPMF stream,
     unstable GPS clock, event outside video duration, no Coin passage, and video
     too short.

## Acceptance criteria

- The reference FIT and matching MP4 for the selected GoPro test device can be
  uploaded in the browser.
- Coin passage is detected even when it occurs between two FIT trackpoints.
- The automatically determined video second is within 1.5 seconds of the recorded
  reference value.
- The application creates a playable MP4 clip at least four seconds long with a
  static Coin and `+100 XP` overlay.
- Unsupported, unsynchronizable, or temporally incompatible inputs produce a clear
  error rather than a seemingly successful clip.
- The container deletes uploads, intermediate artifacts, and the result file within
  30 minutes.

## After the POC passes

1. The other GPMF stream type, additional GoPro models, and position/fix-quality
   checks.
2. Coin animation, multiple Coins, and highlight compilations.
3. Object storage, database, queue, and separate workers for parallel jobs.
4. Additional event types, video sources, and GoPro chapter files.
5. A manual synchronization anchor, admin map editor, accounts, and community
   features.
