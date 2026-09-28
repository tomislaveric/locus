# Milestone 14 — Staza Brand & Activity Terminology Migration

## Goal

Establish **Staza** as the active product brand and **Activity** as the
cross-sport canonical term without changing processing, FIT parsing, GameEvent
semantics, collectible detection, progression, persistence, replay timing,
video synchronization, highlight planning, world behavior, authentication, or
User/Player ownership.

## Scope

- Apply the Staza/STAZA brand to active product UI, auth, shell, metadata,
  accessibility labels, loading/error/success messages, and active
  product-facing documentation.
- Use Activity/Activities for generic navigation, imports, summaries, history,
  detail, profile, home, progress, and replay presentation.
- Use Ride, Run, Hike, and Walk only as natural display labels when activity type
  is known.
- Rename generic UI symbols, files, and coupled selectors from Ride/Rides to
  Activity/Activities after semantic review.
- Add the smallest reliable activity-type metadata only if the parser-to-storage
  trace requires it.

## Decisions

- Completed feature and POC documents retain historical names and wording.
- APIs are internal-only; coordinated contract migrations are allowed, while
  aliases remain only where a stored or deferred flow requires compatibility.
- Applied migrations and persisted identifiers are not renamed for aesthetics.
- Existing FIT and GoPro cycling fixtures retain cycling terminology.
- `unknown` is the safe fallback for absent or unreliable sport information;
  activity type is never inferred from filenames.

## Terminology

| Concept | Canonical meaning |
|---|---|
| Staza | Active product brand |
| Activity | Cross-sport domain object |
| cycling / running / hiking / walking / unknown | Activity type values |
| Ride / Run / Hike / Walk | Contextual presentation labels |
| Player | Gameplay identity |
| User | Authentication/account identity |

Generic contexts use **Activities**, **Add Activity**, **Recent Activities**,
**Distance**, and **Activity Replay**. Typed completion contexts use a central
helper, for example **Ride complete**, **Run complete**, **Hike complete**, or
**Activity complete**.

## Implementation plan

1. Audit active UI, server, API, schema, migration, test, style, config, and
   documentation terms. Classify each use as branding, presentation, migratable
   technical naming, required compatibility, or genuinely cycling-specific.
2. Add a small centralized Staza brand constant where it reduces duplication and
   a single typed helper for singular/plural/completion activity labels.
3. Trace FIT parsing, import, persistence, history/detail API, replay snapshots,
   and UI models. Add an additive five-value activity type only if required;
   preserve legacy values as `unknown`.
4. Migrate active visible copy and semantically generic components/files to
   Activity names, including all imports, tests, ARIA labels, and coupled CSS.
5. Coordinate safe internal API projection changes, keeping explicit,
   documented compatibility aliases only when necessary.
6. Keep cycling-only telemetry, fixture, and camera language accurate; do not
   claim support for unsupported sport or camera workflows.

## Acceptance criteria

- Auth and shell visibly use Staza; generic navigation says Activities and the
  import entry point says Add Activity.
- Generic home, history, detail, progress, profile, and replay copy uses
  Activity terminology.
- Cycling remains naturally presented as Ride, while known running and hiking
  types present as Run and Hike; unknown presents as Activity.
- Activity-type wording is centrally defined and unit-tested.
- No core domain, processing, persistence, replay, media, auth, world, or
  ownership behavior changes.
- Historical documents, applied migrations, and genuine cycling fixtures remain
  intentionally unchanged.
- Intentional API/database compatibility exceptions are documented.

## Validation

- Run the complete established test suite, typecheck, and lint tasks.
- Start the application and verify auth, shell, navigation, import, home,
  history, detail, progress, profile, world, replay, video, and authentication.
- Verify activity labels for cycling, running, hiking, walking, and unknown.
- Search active code and product copy for stale Trailhunt branding and
  inappropriate generic Ride wording; report retained cycling/compatibility
  references.
