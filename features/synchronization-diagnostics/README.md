# synchronization-diagnostics

## Goal

Harden FIT-to-GoPro synchronization against real-world edge cases within the
existing supported scope:

- original GoPro MP4;
- usable GPS5/GPMF metadata;
- matching FIT activity file.

When synchronization is reliable, processing should produce the same result as
the current POC. When synchronization is questionable or impossible, processing
must fail clearly rather than silently create incorrectly timed highlights.

## Scope

Add an explicit synchronization assessment between FIT/GPMF parsing and
`GameEvent` creation. It will report typed success or failure diagnostics,
confidence, warnings, overlap, and collectible event availability.

The feature does not add support for other cameras or devices, metadata
fallbacks, timestamp repair, route reconstruction, gap reconstruction, or a
probabilistic scoring model.

## Current behavior and failure modes

| Case | Current behavior | Required behavior |
|---|---|---|
| No `gpmd` track | Fails with a generic user-facing message. | Report `NO_GPMD_TRACK` with the original-GoPro guidance. |
| Missing GPS5, unreadable GPMF, or empty metadata | Fails with generic GPS5/GPMF error text. | Report `UNSUPPORTED_VIDEO_METADATA`. |
| Placeholder, malformed, or implausible GPS5 dates | Values are discarded; too few plausible/stable values fail generically. | Report `NO_VALID_VIDEO_CLOCK`; never use a placeholder clock. |
| Multiple GPS5 clock candidates | The modal rounded-second cluster and median candidate are selected. | Preserve the algorithm and prove that a valid stable cluster wins. |
| Invalid FIT timestamps | Invalid records are discarded; fewer than two retained points fail generically. | Report `INVALID_FIT_TIMESTAMPS`. |
| FIT/video no time overlap | No explicit check; crossings map outside video and are silently dropped. | Report `NO_OVERLAPPING_TIME_RANGE` before event mapping. |
| FIT begins first, video begins first, or ranges partly overlap | Mapping may work, but there is no operational diagnostic. | Keep valid overlap, record offset/overlap diagnostics, and classify individual unavailable events. |
| Collectible before/after video | Production silently skips it; validation reports only a failed fixture event. | Classify it as `EVENT_OUTSIDE_VIDEO`; do not create a renderable event or crash. |
| FIT sample gaps | No warning, even when interpolation spans a long gap. | Warn at a configurable 30-second threshold without reconstructing data. |
| Midnight/timezone boundaries | Epoch milliseconds should work, but there is no coverage. | Test full UTC instants across midnight and offset-bearing ISO inputs. |
| Activity starts inside a collectible radius | No passage is emitted until an outside-to-inside crossing. | Preserve this existing semantics. |

## Decisions

### Synchronization result

Introduce a first-class discriminated result following existing TypeScript
conventions. A successful result contains:

- `status: "ok"`;
- video start UTC and optional activity start UTC;
- offset and overlap information;
- `confidence: "high" | "medium" | "low"`;
- typed warnings and per-passage availability.

An unsuccessful result contains:

- `status: "error"`;
- a small, actionable error code and message;
- typed warnings.

Use only evidence-backed error codes:

- `NO_GPMD_TRACK`
- `UNSUPPORTED_VIDEO_METADATA`
- `NO_VALID_VIDEO_CLOCK`
- `INVALID_FIT_TIMESTAMPS`
- `NO_OVERLAPPING_TIME_RANGE`
- `EVENT_OUTSIDE_VIDEO` for an individual unavailable passage, not a whole-sync
  error when the activity and video ranges otherwise overlap.

### Confidence and warnings

Confidence is deterministic rather than scored:

- **high:** valid GoPro clock, valid FIT timestamps, overlap, and no warnings;
- **medium:** valid sync with a FIT-gap warning or notable partial-range
  diagnostic;
- **low:** technically valid but explicitly diagnosed suspicious clock/overlap
  condition;
- **error:** synchronization cannot be reliably established.

`FIT_SAMPLE_GAP_WARNING_SECONDS` will use the project configuration conventions
and default to 30 seconds. One- and five-second gaps are normal; a 30-second
gap warns and reduces confidence but does not by itself fail synchronization.

### Job diagnostics

The job result and `GET /api/jobs/:token` response will retain a compact
`synchronization` summary: status, confidence where available,
human-readable warnings, and overlap/available-event counts. Detailed UTC
values and raw telemetry stay in logs/debug diagnostics.

The existing UI will show a concise normal-user diagnostic or warning line.
Out-of-video passages will be counted and classified instead of being silently
discarded. A synchronization error will fail the job with an actionable message
and will never fall back to guessed timing.

## Implementation plan

1. Add `src/synchronization.ts` and `src/synchronization.test.ts`.
   - Define the typed result, errors, warnings, confidence, overlap, FIT-gap,
     and event-availability checks.
   - Validate finite chronological FIT/video samples, UTC video start, inclusive
     range overlap, and in-video event placement.
   - Keep all timestamp calculations in UTC epoch milliseconds.

2. Modify `src/gpmf.ts` and `src/gpmf.test.ts`.
   - Extract a small pure GPS5 candidate validation/selection seam while
     preserving the current 2020–2100 plausibility guard, modal rounded-second
     cluster, and median clock selection.
   - Map missing `gpmd`, unsupported GPS5/GPMF metadata, and invalid clocks to
     the result codes at the processing boundary.

3. Modify `src/fit.ts` and add focused FIT tests if a pure validation seam is
   extracted.
   - Preserve FIT parsing and coordinates.
   - Distinguish insufficient usable timestamped points as
     `INVALID_FIT_TIMESTAMPS`.

4. Modify `src/domain.ts`, `src/server.ts`, `public/app.js`, and `README.md`.
   - Persist/expose the compact job synchronization summary.
   - Assess synchronization before `GameEvent` creation.
   - Stop processing before event mapping on errors.
   - Create renderable events only for available crossings, while retaining
     unavailable event counts and warnings.

5. Modify `src/syncValidation.ts`, `src/syncValidation.test.ts`, and
   `src/runSyncValidation.ts`.
   - Reuse the same assessment in production and fixture validation.
   - Include typed errors, overlap, warnings, and unavailable-event
     classifications in validation diagnostics.

6. Modify `src/config.ts` and documentation.
   - Add `FIT_SAMPLE_GAP_WARNING_SECONDS` with a default of 30 seconds.
   - Document supported inputs, error codes, UTC semantics, diagnostics, and
     the configuration variable.

7. Keep `src/geometry.ts`, `src/highlightPlanner.ts`, HUD/rendering behavior,
   the `GameEvent` contract, clip durations, and FFmpeg invocation unchanged.
   Existing planner/HUD range filtering remains a defensive backstop rather
   than the primary synchronization error mechanism.

## Test matrix

- normal valid FIT/GPS5 pair retains the current POC mapping;
- valid UTC GPS5 clock, placeholder-only timestamps, missing timestamps,
  malformed timestamps, and mixed candidates with one valid stable cluster;
- fewer than two usable FIT timestamped points;
- FIT starts first, video starts first, partial overlap, and no overlap;
- collectible before video and after video;
- UTC midnight crossing and offset-bearing ISO inputs without double timezone
  conversion;
- normal one- and five-second FIT gaps plus a 30-second warning gap;
- activity that begins inside a collectible radius;
- injected/synthetic production-orchestration cases where possible;
- the existing real-media synchronization fixture for GPMF extraction.

## Acceptance criteria

1. Synchronization success and failure are represented explicitly.
2. Known invalid GoPro clocks are rejected without silent fallback.
3. FIT/video time overlap is validated.
4. Out-of-video events are handled without crashes or renderable highlights.
5. Midnight/date-boundary behavior is covered.
6. FIT gaps provide diagnostics.
7. Failed synchronization never produces guessed highlights.
8. The valid POC output remains unchanged.
9. Errors are actionable.
10. The synchronization regression suite still passes.

## Validation

Run focused synchronization, GPMF, FIT, geometry, and sync-validation tests;
then run the full Vitest suite and TypeScript build. Run `npm run test:sync`
with known-good external media when available; absent media must remain an
explicit skip.
