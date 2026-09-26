# Persistent activities player state v1

## Goal

Make completed activities and player progression durable across server restarts
without building an account platform. A valid FIT activity must persist as
product state, retain its collected event snapshots, award XP exactly once, and
remain valid if optional video enrichment later fails.

## Scope

The current filesystem job store remains transient processing infrastructure:
job JSON, uploaded FIT/MP4 files, GPMF/HUD artifacts, outputs, and their
existing TTL policy are not moved into the database. PostgreSQL becomes the
durable source for compact activity history, collected event history, and player
total XP.

This feature adds:

- migration-managed PostgreSQL persistence behind a small repository boundary;
- a default local player with durable total XP;
- durable compact activity and event records;
- idempotent, transactional activity/event/XP commits;
- persistent activity history/detail and player-progress APIs;
- persistent progression presentation in the existing completed-ride UI; and
- isolated PostgreSQL persistence tests and documented local setup.

This feature does not add authentication, registration, passwords, OAuth,
Garmin/Strava imports, social features, inventory, currency, achievements,
media blobs, raw telemetry blobs, or a broad job-storage rewrite.

## Current state

Jobs currently live under `data/jobs/<48-hex-token>/` as `job.json` plus
uploads, generated artifacts, and an optional clip. `src/server.ts` loads them
directly and removes them after the job/selection TTL. `Activity`,
`ActivityResult`, and `GameEvent` objects exist only in that temporary job
record.

Progression currently exists only in browser memory: `public/app.js` keeps a
total XP number and an applied-job map, while `public/progression.js` derives
level values. Page reloads and server restarts reset progression. Optional video
failure can leave an otherwise valid activity only in a transient failed job.

## Decisions

### PostgreSQL persistence

Use PostgreSQL through `pg`, not an ORM:

- `pg.Pool` provides parameterized queries and connection pooling.
- A dedicated repository owns all runtime SQL and transaction control. Domain
  derivation, FIT parsing, rendering, and HTTP orchestration remain
  database-agnostic.
- Ordered explicit migrations are recorded in a `schema_migrations` ledger and
  applied transactionally by a small in-project runner.
- Add runtime dependency `pg` and development dependency `@types/pg`; do not
  add a separate migration framework.

`DATABASE_URL` is required at startup. `DEFAULT_PLAYER_ID` identifies a stable
default local player (with a documented reserved UUID default). Initialization
upserts that player without introducing login or authorization. The application
image receives its database URL at runtime and does not embed PostgreSQL.

### Durable schema

The initial migration creates:

| Table | Durable product state |
| --- | --- |
| `players` | UUID primary key, non-empty display name, non-negative `total_xp`, creation timestamp |
| `activities` | stable internal ID, player foreign key, FIT source metadata, timing/distance/duration, XP, collected count, `has_video`, creation timestamp |
| `activity_events` | event UUID, activity foreign key, canonical source/type, event timestamp, value, optional coordinates, event-time collectible name/rarity/type |

`activities.id` is the current job token and is the internal exactly-once
identity. A partial unique index on
`(player_id, source_type, source_external_id)` when the external ID is non-null
prepares future Garmin/Strava imports without implementing them. History is
indexed by `(player_id, created_at DESC, id DESC)`, and events by
`(activity_id, activity_timestamp, id)`. A unique `(activity_id, source_id)`
constraint matches the current first-passage-per-collectible model.

All XP/value/count columns are constrained non-negative. Foreign keys connect
activities to players and events to activities. Event snapshots retain enough
event-time data to render historical collection information after `coins.json`
changes.

Only `players.total_xp` is persisted progression source state. Level,
current-level XP, next-level XP, and progress fraction are derived from the
Milestone 9 curve at read time. Do not persist redundant level values.

Do not store routes, near misses, world-query output, `videoSecond`, raw FIT
telemetry, GPMF/HUD files, FFmpeg logs, input video, output video, or file paths
in PostgreSQL.

## Activity lifecycle and transaction boundary

1. Existing detection parses the FIT and derives `Activity` and
   `ActivityResult`; the existing job token becomes the stable activity ID.
2. Immediately after valid FIT/gameplay derivation, before FIT-only completion
   or optional video synchronization, the server converts the result into a
   compact persistence command.
3. `ActivityRepository.persistCompletedActivity` starts a transaction, inserts
   the activity, inserts all event snapshots, and increments the default
   player's `total_xp` by `xp_earned`.
4. The transaction commits only when all three operations succeed. An event,
   constraint, or player-update failure rolls back all operations, so neither
   partial history nor unpaired XP is visible.
5. On an existing activity ID, the repository returns the prior activity/player
   state without inserting events or incrementing XP. Repeated completion
   handlers, polling, restarts, or render retries cannot double-award XP.
6. FIT-only jobs continue to their normal successful job state; video jobs only
   continue to synchronization/selection after the gameplay commit succeeds.

This feature intentionally does not attempt GPS-similarity duplicate detection.
The internal activity ID protects a job from duplicate commits now, and the
future external-source unique index provides the later import boundary.

## Optional-video semantics and media retention

Persist gameplay once valid activity processing succeeds, not after optional
rendering. `has_video` starts false and is set true only after a final video is
successfully available. This update never reapplies XP or rewrites events.

Synchronization or render failure stays in the existing retained job
state/error, but leaves the durable activity, event history, and player XP
unchanged. History reports `hasVideo: false` if no completed video is available.
The existing job/media retention policy continues to own uploaded and rendered
large files.

## APIs and UI

Add these compact read endpoints for the default player:

- `GET /api/activities` returns recent activities newest-first with `id`,
  `startedAt`, `distanceMeters`, `durationSeconds`, `xpEarned`,
  `collectedCount`, and `hasVideo`.
- `GET /api/activities/:id` returns the activity summary, its ordered persisted
  event snapshots, and `xpEarned` as the progression contribution.
- `GET /api/player/progress` returns `totalXp`, `level`, `currentLevelXp`,
  `nextLevelXp`, and `progressToNextLevel`, derived from the canonical
  Milestone 9 formula.

Existing job endpoints and their active processing, selection, rendering,
download, replay, near-miss, world-query, and mapped-event contracts remain
available. The progression panel stops using browser-memory lifetime XP and
reads persistent player progress instead. Replay scoring remains scoped to the
current activity.

Move progression mathematics to one server-owned module that is also exposed to
the browser, preventing API and UI drift.

## Implementation plan

1. Add PostgreSQL configuration, pool lifecycle, migration ledger/runner,
   initial schema, default-player initialization, typed row mappers, and an
   `ActivityRepository`.
2. Make server construction testable and inject the repository. Persist
   gameplay immediately after FIT result derivation, then update video
   availability independently after successful rendering.
3. Add activity history, activity detail, and persistent progress endpoints.
   Centralize progression logic and replace browser-memory lifetime progression.
4. Add migration and persistence-test scripts, PostgreSQL Compose configuration,
   Docker/runtime support, and setup/API/retention documentation.
5. Add database-backed repository/API tests, retain existing FIT/video/replay
   behavior, then run focused tests, the build, and the full suite.

## Tests and validation

Use a dedicated `TEST_DATABASE_URL`, migrate it, and truncate/reset its durable
tables between tests. Tests must verify:

- activity fields and event-time presentation snapshots persist;
- unchanged history rendering after the world config changes;
- same-activity persistence applies XP once;
- multiple activities accumulate XP, including zero-XP activities;
- a fresh pool/repository reconstructs activities, XP, and derived level;
- history ordering and activity detail event reconstruction;
- progress API values match the Milestone 9 curve;
- a controlled database error rolls back activity, events, and XP together;
- video absence/failure cannot corrupt committed gameplay, while success sets
  `hasVideo`; and
- API response contracts and existing job/replay flows remain compatible.

Retain existing unit coverage for FIT parsing, detection, world query, replay,
HUD, synchronization, highlighting, and progression. Validate with the
persistence suite, focused existing tests, `npm run build`, and `npm test` with
the dedicated test database configured.

## Planned files

| File | Change |
| --- | --- |
| `package.json`, `package-lock.json` | Add `pg`, types, and migration/persistence-test scripts. |
| `src/config.ts`, `src/domain.ts`, `src/progression.ts` | Add database config/DTOs and shared progression formula. |
| `src/persistence/database.ts` | Configure PostgreSQL pool/lifecycle. |
| `src/persistence/migrations.ts`, `src/persistence/migrate.ts` | Define/run explicit ledger-backed migrations. |
| `src/persistence/activityRepository.ts` | Own transaction-safe writes and durable reads. |
| `src/persistence/activityRepository.test.ts` | Add isolated PostgreSQL persistence and rollback tests. |
| `src/server.ts`, `src/server.test.ts` | Integrate persistence, APIs, and testable app construction. |
| `public/progression.js`, `public/app.js` | Use a single progression source and persistent progress UI. |
| `docker-compose.yml`, `Dockerfile`, `README.md` | Document and support local PostgreSQL, migrations, configuration, APIs, and retention. |

## Constraints

Leave FIT parsing, geometry, collectible configuration, world query, GameEvent
detection, near misses, HUD, synchronization, highlight planning, FFmpeg
rendering, and replay logic intact. Preserve filesystem job IDs, job JSON,
upload/render layout, and media cleanup except for persistence call ordering and
the final video-availability update.
