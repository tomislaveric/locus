# World Collectible Domain Model V1

## Goal

Replace anonymous configured Coin records with a small reusable Collectible domain
model. A normalized Collectible must provide the common source of world meaning for
route interaction, canonical game events, activity results, replay, video HUD, and
future world/progression work.

The expected flow is:

```text
Collectible -> route interaction -> GameEvent -> replay / HUD / video
```

Renderers must consume collectible meaning from events and normalized world data;
they must not invent their own collectible model.

## Scope

### Included

- A first-class normalized Collectible model with ID, name, type, coordinates,
  radius in meters, value, optional rarity, and optional description.
- Types `coin` and `landmark`, both using the existing point-plus-radius
  interaction semantics.
- Rarities `common`, `rare`, and `epic` as presentation-only metadata.
- Normalization of both the existing legacy JSON shape and a richer config shape.
- Clear boundary validation for malformed or duplicate configuration.
- Generic `collectible_collected` game events using canonical `sourceId`.
- Compact event-time presentation metadata for name, type, and rarity.
- Replay, selection UI, and HUD display of collectible names and optional rarity.
- Compatibility handling for the existing video selection API and event identifiers.

### Excluded

- Persistence, databases, CRUD/admin UI, remote world services, or user-created
  collectibles.
- Ownership, inventory, respawn rules, schedules, seasons, prerequisites, quests,
  achievements, creator/image/sponsor metadata, economy, or progression rules.
- Alternative detection algorithms, segments, clip-duration changes, or video
  rendering pipeline redesign.

## Current state

The POC currently loads legacy Coin records from `coins.json`:

```json
{
  "id": "reference-coin4",
  "latitude": 49.01385,
  "longitude": 8.40694,
  "radius_m": 5,
  "value": 100
}
```

Those raw Coin objects currently pass through the loader, geometry detection,
activity result, HUD timeline, and replay. `GameEvent.id` also doubles as the Coin
ID for the current UI and render-selection request.

The existing detection behavior is intentional and must remain unchanged: only the
first outside-to-inside entry produces an event; an activity starting inside does
not collect; leaving and re-entering does not produce a second event.

## Domain and configuration decisions

The normalized domain model is:

```ts
type CollectibleType = "coin" | "landmark";
type CollectibleRarity = "common" | "rare" | "epic";

interface Collectible {
  id: string;
  name: string;
  type: CollectibleType;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  value: number;
  rarity?: CollectibleRarity;
  description?: string;
}
```

The loader is the sole raw-configuration boundary and returns `Collectible[]`.
Legacy entries normalize to `name: id`, `type: "coin"`, and
`radiusMeters: radius_m`. Rich entries support the same required fields plus
`name`, `type`, `rarity`, and `description`:

```json
{
  "id": "turmberg",
  "name": "Turmberg",
  "type": "landmark",
  "latitude": 49.0112,
  "longitude": 8.4728,
  "radius_m": 20,
  "value": 250,
  "rarity": "rare",
  "description": "A landmark collectible on the Turmberg."
}
```

Configuration validation rejects a blank ID, invalid or non-finite coordinates,
non-positive radius, negative or non-finite value, unsupported type or rarity,
invalid optional strings, and duplicate IDs. The new validation rule is
`radius_m > 0`; the legacy 5 m loader restriction is removed. This does not change
the radius calculation or passage semantics.

## Event and compatibility decisions

`GameEvent` becomes event-neutral:

- `type` is `collectible_collected`;
- `sourceId` is the canonical relationship to the normalized Collectible;
- event coordinates, timestamp, value, and optional video second remain;
- optional compact metadata preserves collectible name, type, and rarity at event
  time for stable presentation;
- a complete Collectible object is not copied into every event.

The current public `coinIds` render-selection field and existing event `id` values
remain compatibility aliases for this milestone. They map to the same canonical
event/source internally and must be isolated and clearly marked for future removal.
New domain logic must use `sourceId`, not `id` or `coinIds`. Where practical, the
server accepts canonical generic selection input in addition to the legacy input.

`ActivityResult` continues to expose canonical events, collected count, and total
points. It carries normalized source Collectibles for existing replay use; no
separate collected-item projection is needed because events remain the source of
truth.

## Presentation decisions

- Activity replay matches events to Collectibles with `sourceId` and displays names
  instead of technical IDs, with a simple optional rarity label or decoration.
- The video selection UI retains legacy checkbox/API identifiers but displays the
  same name and optional rarity metadata.
- The HUD timeline validates normalized Collectibles and canonical events. Its next
  item, feedback, and event feed render shared event metadata rather than
  hard-coded Coin text.
- Rarity may influence only text and simple marker decoration. Type remains
  descriptive; `coin` and `landmark` share exactly the same detection path.
- The optional value-only legacy Coin overlay remains intact as a compatibility
  renderer and does not become a second Collectible domain model.

## Implementation plan

1. Define Collectible, type, rarity, and canonical GameEvent contracts in
   `src/domain.ts`.
2. Replace the Coin-specific config boundary with a normalized Collectible loader.
   Retain legacy `coins.json`, `COINS_FILE`, and any thin compatibility export only
   where required by the working POC.
3. Rename geometry inputs/functions to Collectible terminology without changing
   crossing math, sorting, or one-event-per-source behavior.
4. Produce canonical collectible events in activity derivation, then propagate the
   type through job serialization, video mapping, HUD timelines, highlight
   selection, and renderer inputs.
5. Retain `coinIds` and event `id` aliases at public compatibility boundaries while
   resolving internal relationships through `sourceId`.
6. Update replay, browser selection, and HUD rendering to consume shared event
   presentation metadata.
7. Update the configuration example and README to document legacy/rich shapes,
   normalized behavior, validation, and the temporary aliases.

Expected implementation touchpoints are `src/domain.ts`, config loader module,
`src/activity.ts`, `src/geometry.ts`, `src/server.ts`, `src/config.ts`,
`src/hud/timeline.ts`, `src/hud/state.ts`, `src/hud/hudRenderer.ts`,
`public/replay.js`, `public/app.js`, `coins.json.example`, `README.md`, and
affected loader/activity/geometry/HUD/synchronization tests.

FIT parsing, GPMF extraction and synchronization, highlight interval planning,
FFmpeg command construction, job lifecycle, and persistence architecture remain
unchanged except for necessary type wiring.

## Acceptance criteria

1. A first-class Collectible domain model exists.
2. Legacy coin configuration continues to load correctly.
3. Rich collectible configuration loads correctly.
4. Raw configuration normalizes only at the boundary into `Collectible[]`.
5. Canonical GameEvents reference Collectibles through `sourceId`.
6. Activity totals and collected counts remain correct.
7. Replay displays collectible names instead of reference IDs.
8. Video HUD consumes the same collectible presentation metadata.
9. Rarity is optional presentation-only metadata.
10. Coin and landmark use identical point/radius semantics.
11. Invalid configuration fails clearly.
12. Existing activity and video POC behavior continues to pass.
13. No persistence, account, social, progression, or segment logic is added.

## Validation

- Test legacy and rich normalization, default name/type, optional rarity,
  unsupported type/rarity, duplicate IDs, invalid radius, invalid coordinates, and
  clear validation errors.
- Test canonical `sourceId`, value preservation, event metadata, and legacy alias
  mapping to the same underlying source.
- Preserve the current interpolation, first-entry, starting-inside, no-repeat, and
  chronological detection tests.
- Verify normalized timeline serialization and replay/HUD/selection availability of
  display names and rarity.
- Run focused loader, activity, geometry, HUD, replay, and synchronization tests,
  followed by the TypeScript build and full test suite.
