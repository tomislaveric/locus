# Job lifecycle operational robustness

## Goal

Make the single-container processing flow reliable when uploads are invalid,
jobs fail, FFmpeg exits unexpectedly, the process restarts, temporary artifacts
remain, or completed downloads expire. The feature provides explicit lifecycle
semantics, isolated local filesystem ownership, safe final-output publication,
recoverable terminal records, and concise operational diagnostics without adding
distributed infrastructure.

## Scope

The existing local job JSON and job root remain the persistence mechanism.
Lifecycle/storage responsibilities move behind a small filesystem-backed job
service. It owns ID creation, job layout, atomic record persistence, state
transitions, cleanup, retention, stale-job recovery, and final output promotion.

The existing two-step product flow is retained:

```text
upload -> telemetry/event processing -> awaiting selection -> render -> download
```

No Redis, queue, worker service, cloud media store, Kubernetes deployment,
resumable FFmpeg work, retry UI, or distributed recovery is introduced.

## Current baseline

- `POST /api/jobs` creates a random 48-character token using `randomBytes(24)`,
  creates `DATA_DIR/<token>/`, and persists `job.json`.
- Multer writes `track.fit` and `video.mp4` into that flat directory. Detection
  runs asynchronously and persists `awaiting_selection` or `failed`.
- Rendering later creates a random `render-*` subdirectory, writes `clip.mp4`
  directly beside the uploads, validates it, and then persists `succeeded`.
- A process-local `busy` flag serializes work. The job token and renderer
  temporary directories already make accidental path collisions unlikely.
- Startup and an interval remove directories by a generic TTL. In-progress jobs
  persist after a process crash without explicit interruption semantics.

## Lifecycle and job record

Use the project’s lower-case state convention:

```text
uploading -> validating -> processing -> awaiting_selection
awaiting_selection -> rendering -> validating_output -> completed
uploading/validating/processing/rendering/validating_output -> failed
```

`completed` and `failed` are terminal. One transition helper validates every
transition, updates timestamps and stage progress, atomically persists the
record, and logs invalid transition attempts. Reservation persists `uploading`;
a distinct persisted `created` state has no observable value in the current
synchronous multipart flow. `awaiting_selection` remains because the current
UX requires it. Multipart rejection before `202 Accepted` remains an HTTP `400`
and removes its unexposed reservation; all failures after acceptance persist as
terminal structured job failures.

The compact persisted record contains:

- ID/token, lifecycle status, `createdAt`/`updatedAt`, optional
  `completedAt`/`failedAt`;
- sanitized input filenames;
- truthful stage-only progress;
- existing synchronization and render summaries;
- validated output filename, optional duration and byte size;
- concise `{ code, message }` failure details and warnings.

Normal status responses omit filesystem paths, raw FFmpeg stderr, and large
telemetry/log data. A completed response exposes output availability only after
the promoted output exists.

## Filesystem and output policy

Every job receives its own local structure:

```text
<job-root>/<job-id>/
  input/
  work/
  output/
  logs/
  job.json
```

Original uploads are stored only under `input/`. Render segments, HUD frames,
effect files, concat lists, and the candidate final MP4 stay under `work/`.
After FFmpeg and final output validation succeed, the candidate file is atomically
renamed to `output/highlight.mp4`; only then can the job become `completed`.

Failures record their concise error before deleting large temporary render
artifacts. They do not expose a final-download path. Success cleanup removes
work artifacts while retaining the product-required input/output metadata for the
configured retention window.

## Failure, restart, retry, and concurrency semantics

- Pipeline boundaries use concise existing or lifecycle error codes, including
  input validation, synchronization, highlight planning, render, final output
  validation, and internal failures. Existing synchronization taxonomy is reused.
- FFmpeg child errors, exit status, timeout, and stderr use an internal command
  error detail for contextual logging. Stage boundaries map that detail to a
  safe categorized job error; raw stderr never reaches normal API responses.
- On startup, every persisted active job becomes a terminal failed/interrupted
  record: in this single-container model the previous process is gone and
  partial FFmpeg work is not resumed.
- Retention cleanup removes terminal completed jobs after 24 hours by default and
  terminal failed artifacts after 6 hours by default. `awaiting_selection`
  retains its separate configurable selection TTL. Active/recent jobs are never
  removed; missing files are harmless; orphan/corrupt directories are handled
  only after a conservative stale age. The cleanup boundary supports dry-run
  logging.
- Retry means a fresh upload and new job ID. Original inputs are not reused.
- The in-process capacity remains one active job by default. A small
  `MAX_CONCURRENT_JOBS` setting may expose the existing limiter as capacity, but
  no scheduler or queue is added. It counts only active detection/rendering
  work and is released in `awaiting_selection`, preserving the current ability
  to process another upload while a user chooses events. Each configured
  concurrent job remains filesystem-isolated.

## Implementation plan

1. Add a testable local job service for token generation, fixed job paths,
   atomic metadata writes, record loading, legal state transitions, structured
   failure recording, promotion, cleanup, and stale-job recovery.
2. Update domain types and server orchestration to use the job service, progress
   stages, structured errors, lifecycle logging, and `finally`-safe in-process
   capacity release.
3. Move uploads to `input/`; reject multipart validation failures before job
   acceptance with HTTP `400` and delete their reservations. Retain the existing
   detection, synchronization,
   event, selection, HUD, and rendering algorithms while directing all transient
   render work to `work/`.
4. Render to `work/final-render.tmp.mp4`, validate it with the existing media
   checks, atomically promote it to `output/highlight.mp4`, then mark completed.
5. Make command stderr internal-only: return structured execution details from
   the command boundary for logging, and map errors to safe job-stage messages
   and codes without exposing raw stderr.
6. Add separate completed/failed retention, conservative cleanup, startup
   interruption handling, and explicit missing/expired/unavailable download
   responses.
7. Update `public/app.js`, the status endpoint, and browser polling contract
   while preserving the
   upload, event-selection, and download UX.
7. Document lifecycle, crash behavior, retention, configuration, and supported
   operational boundaries in the root README.

## Configuration

Maintain `DATA_DIR` compatibility as the local job root unless an explicitly
named job-root setting is introduced. Add validated, documented configuration for
completed retention, failed retention, stale active-job detection, and optional
in-process capacity. Existing selection TTL remains configurable.

Defaults:

- completed job retention: 24 hours;
- failed job retention: 6 hours;
- selection retention: existing 30 minutes;
- active job capacity: 1.

## Acceptance criteria

1. Jobs have explicit, validated lifecycle states and compact persisted records.
2. Each job has isolated input, work, output, and logs directories.
3. Render output is temporary until validation passes and atomic promotion occurs.
4. Only completed jobs with validated promoted output are downloadable.
5. Failures stop later processing, persist structured diagnostics, and expose no
   final video.
6. Success and failure cleanup safely remove unnecessary large work artifacts.
7. Terminal retention, stale-job cleanup, and startup interruption behavior are
   explicit and conservative.
8. Fresh retries cannot reuse corrupt/stale intermediate state.
9. Configured concurrent jobs cannot collide in paths, records, or outputs.
10. Status diagnostics are useful without exposing paths or raw logs.
11. Existing known-good end-to-end behavior remains intact.

## Validation strategy

Use temporary directories and local failure hooks/mocks rather than large source
media. Add focused tests for:

- allowed/invalid state transitions and terminal behavior;
- unique job layouts and two-job path isolation;
- temporary final output never being downloadable;
- success and failure cleanup, including already-missing files;
- completed/failed expiration, active-job protection, and cleanup dry runs;
- stale active-job recovery after simulated restart;
- input, sync, planning, segment-render, concat, and output-validation failures;
- child-process error/timeout/stderr handling without raw API exposure;
- compact status/download responses, including completed/intermediate states,
  and preserved selection flow/capacity release.

Run the narrow lifecycle tests, relevant renderer tests, and the TypeScript build.

## Intentionally unchanged

- FIT parsing, event detection, synchronization behavior, and `GameEvent`
  semantics;
- highlight-plan logic, selection rules, clip durations, output media profile,
  HUD appearance, and `coins.json`;
- external infrastructure and deployment model.
