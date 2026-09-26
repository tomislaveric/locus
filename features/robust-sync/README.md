# robust-sync

## Goal

Make the existing FIT-to-GoPro synchronization measurable, regression-testable,
and trustworthy. Given a matching FIT/GoPro pair and manually verified
collectible timestamps, the validation command must report how accurately the
current pipeline places those events on the video timeline.

The initial quality target is placement within 1.5 seconds for each manually
verified reference event. This feature prioritizes robust regression detection,
clear diagnostics, and deterministic results over millisecond optimization.

## Scope

This feature adds validation and test infrastructure only. It must not change
the HTTP API, UI, highlight selection, HUD, rendering behavior, clip duration,
collectible model, `coins.json` format, or the synchronization algorithm unless
a clearly demonstrated bug is found.

## Current synchronization flow

1. `parseFitTrack` reads FIT records, preserves only finite coordinates with a
   parseable timestamp, converts timestamps to UTC milliseconds, and sorts the
   resulting trackpoints.
2. `detectCoinPassage` scans consecutive FIT samples for the first
   `outside -> inside` transition for a Coin. It estimates the entry timestamp
   by linearly interpolating between endpoint distances and timestamps.
   `detectFirstCoinPassages` performs this independently per Coin and orders
   first entries chronologically.
3. `extractGps5Times` extracts GoPro GPS5 GPMF timing. It excludes absent,
   unparseable, and implausible (outside 2020–2100) UTC timestamps, including
   placeholder clocks. For each candidate it derives:

   ```text
   videoStartMs = GPS5 UTC milliseconds - CTS milliseconds
   ```

   It finds the modal rounded-second cluster, requires at least 20 samples
   within two seconds of that cluster, uses the median candidate as the stable
   video start, then emits synchronized `{ timestampMs, videoSeconds }` values.
4. `mapToVideoSecond` recomputes the median video-start value from the emitted
   samples and maps an activity timestamp with:

   ```text
   videoSecond = (activityTimestampMs - videoStartMs) / 1000
   ```

5. Detection excludes mapped events outside the real video duration
   (`videoSecond < 0` or `videoSecond > probeDuration(video)`) before production
   events are rounded to millisecond precision.

## Decisions

- Fixtures are isolated from production `coins.json`: each fixture owns the
  Coin definitions required to reproduce its reference events.
- Fixture files specify a name, FIT/video paths relative to the fixture, one or
  more manually verified reference events, per-event tolerances, and optionally
  the expected video-start UTC timestamp.
- Reference media is not committed at multi-gigabyte size. Known-good media is
  resolved from an optional externally configured fixture root.
- A missing external FIT/MP4 is reported prominently as **skipped**, never as a
  successful validation. Media-independent unit tests always run. Runnable
  fixtures that fail validation make the command fail.
- The fixture runner must not hardcode fixture data into production logic.

## Implementation plan

1. Add a typed sync-validation module that loads and validates fixtures, reuses
   the current FIT parsing, passage detection, GPS5 timing extraction, timestamp
   mapping, and video-duration checks, and exposes testable results.
2. Add a CLI runner and `npm run test:sync`. It discovers fixtures
   deterministically and prints concise per-event rows:

   ```text
   Ride: ride-01
   coin-a expected 182.42 actual 182.81 error 0.39 PASS
   ```

   It then reports event count, passed/failed count, mean absolute error,
   median absolute error, maximum absolute error, and p95 when the sample size
   makes it meaningful.
3. For every event, calculate and retain the expected video second, actual video
   second, absolute error in seconds, and tolerance result. A failed result must
   report source ID, video-start UTC, FIT event UTC, computed video second,
   expected video second, and error. Raw telemetry is emitted only in explicit
   debug mode.
4. Add fixture examples and a known-good POC fixture that can run whenever its
   external media is available.
5. Add focused unit tests for collectible crossing interpolation:
   - crossing exactly on a FIT sample;
   - crossing between samples;
   - sparse samples;
   - outside-only tracks;
   - starting inside;
   - single entry;
   - exit after entry;
   - first valid entry only.
6. Add focused unit tests for activity-timestamp-to-video-second mapping:
   - event at video start;
   - event ten seconds after video start;
   - FIT beginning before video;
   - video beginning before the relevant collectible;
   - event before video start;
   - event after video end;
   - sub-second precision.
7. Document fixture authoring, formula/semantics, command behavior, diagnostics,
   determinism, and the 1.5-second quality target.

## Expected files

### Modify

- `package.json`
- `README.md`
- `src/gpmf.ts` only if a narrow, testable video-start diagnostic seam is needed
- `src/geometry.test.ts`

### Add

- `src/gpmf.test.ts`
- `src/syncValidation.ts`
- `src/syncValidation.test.ts`
- `src/runSyncValidation.ts`
- `fixtures/sync/*.json`

## Acceptance criteria

1. The current synchronization flow is documented in code, tests, or feature
   documentation.
2. Reference fixtures can define matching FIT/video inputs and verified events.
3. A repeatable command runs all available synchronization fixtures.
4. Event errors and aggregate accuracy metrics are calculated automatically.
5. Crossing interpolation and timestamp mapping have focused unit coverage.
6. A synchronization regression is immediately visible through a failing result
   or command exit status.
7. No mapping failure is silently discarded by the validation path.
8. Production behavior remains unchanged.
9. The available known-good POC fixture passes its configured 1.5-second
   tolerance.

## Validation

- Run the existing Vitest suite and the focused geometry, mapping, and
  sync-validation tests.
- Run TypeScript compilation.
- Run `npm run test:sync` with known-good external media and verify stable
  event-level output, aggregate metrics, and the configured tolerance.
- Verify that an unavailable external fixture is explicitly marked skipped.
- Verify that a deliberately failing fixture produces diagnostics and a nonzero
  exit status.

## Fixture authoring and diagnostics

Place one JSON fixture in `fixtures/sync` with a deterministic filename. `fit` and
`video` are paths relative to the fixture directory by default, or to
`SYNC_FIXTURE_ROOT` when that environment variable is set. Keep the media outside
Git; the committed POC fixture names the required files and retains only its
fixture-local Coins and manually verified expected video seconds.

Each reference event specifies `coinId`, `expectedVideoSecond`, and an optional
`toleranceSeconds` (default **1.5**). `expectedVideoStartUtc`, when specified,
is enforced against the derived GPS5 video start with a **1.5-second** tolerance.
The runner computes the FIT crossing timestamp, derives the median GPS5 UTC video
start, maps the crossing with
`(fitTimestampMs - videoStartMs) / 1000`, and rejects mapped events before zero or
after the probed video duration. It prints expected and actual seconds, absolute
error, and PASS/FAIL per event, then mean absolute error, median, maximum, and p95
when at least 20 events are available.

Failures include the fixture source ID, GPS5 video-start UTC, FIT event UTC,
computed and expected seconds, and error. `npm run test:sync -- --debug` additionally
emits those details for passing events. Fixture discovery is lexicographically
sorted, and all timestamp calculations retain sub-second precision. An available
fixture that cannot be processed emits failed events and diagnostics, then the
runner continues with remaining fixtures and prints the aggregate summary.
