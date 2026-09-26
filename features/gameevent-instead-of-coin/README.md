# GameEvent instead of Coin

## Goal

Replace the Coin-specific detection record used by downstream video and HUD
logic with a first-class typed GameEvent contract. Coin behavior must remain
identical: configured Coins are detected, users choose detected Coin passages,
clip timing remains the same, and the HUD timeline renders the same collection
behavior.

## Scope

- Generalize `DetectedCoinPassage` into a `GameEvent` used by persisted jobs,
  video rendering, HUD timelines, and HUD state.
- Preserve each event's identifier, value, latitude, longitude, and mapped
  `videoSecond`.
- Preserve the original interpolated FIT crossing time as
  `activityTimestamp`.
- Keep `coins.json` as the Coin configuration source and retain its validation.
- Keep the existing external selection request shape, `{ coinIds }`, and
  Coin-focused browser wording.

## Decisions and constraints

The GameEvent contract for this Coin-only feature is:

```ts
interface GameEvent {
  id: string;
  type: "coin";
  value: number;
  latitude: number;
  longitude: number;
  activityTimestamp: number;
  videoSecond: number;
}
```

- A Coin event's `id` is the configured Coin ID.
- Coin collection triggers on the first interpolated **entry** crossing into a
  Coin radius. This is the current intended behavior and must not change.
- `activityTimestamp` is the unrounded FIT/GPS epoch-millisecond entry crossing
  time. `videoSecond` remains rounded to millisecond precision after GPMF clock
  mapping.
- The generic contract is deliberately limited to `type: "coin"` in this
  feature; it establishes an extensible discriminant without adding other event
  types.
- Temporary job and HUD timeline artifacts may adopt the new schema without
  backward compatibility for expired in-flight jobs.

## Implementation plan

1. Define `GameEvent` in `src/domain.ts`, replacing
   `DetectedCoinPassage` in internal/downstream contracts. Include `id`,
   `type`, `value`, coordinates, `activityTimestamp`, and `videoSecond`.
2. In `src/server.ts`, map first Coin entry crossings to timestamp-preserving
   GameEvents after GPMF video-time mapping. Continue ordering by
   `videoSecond`, validate selected `coinIds` against `event.id`, and preserve
   all empty, duplicate, limit, and unknown-ID validation.
3. Migrate `src/video.ts` clip intervals and renderer inputs to `GameEvent[]`,
   retaining current clip-window clamping/merging and legacy Coin-effect access
   to event values.
4. Migrate `src/hud/timeline.ts`, `src/hud/state.ts`, and
   `src/hud/hudRenderer.ts` to consume GameEvents while preserving next-item,
   collection feedback, map markers, chronological feed behavior, and Coin
   display text.
5. Update `public/app.js` to read generic status events and use `event.id` for
   checkbox values, while retaining default selection behavior, Coin labels, and
   the `{ coinIds }` render request.
6. Update test fixtures, regression coverage, and product documentation to
   reflect the GameEvent contract and preserve entry-crossing semantics.

## Acceptance criteria

- Video and HUD consumers no longer depend on a Coin-specific detected-passage
  type; they use the typed GameEvent contract.
- Every mapped Coin event retains its configured ID/value/coordinates,
  `activityTimestamp`, and `videoSecond`.
- Each configured Coin still produces at most one event from its first
  interpolated entry crossing, in chronological video order.
- Users retain the existing default-selected Coin passage UI and the
  `{ coinIds }` selection API; the server retains all current selection
  validation.
- Clip interval construction, merging, render ordering, and legacy Coin effects
  are unchanged.
- HUD next-item, marker disappearance, collection feedback, and event-feed
  timelines remain unchanged.

## Validation

1. Update `src/video.test.ts` and `src/hud/state.test.ts` fixtures to use
   GameEvents.
2. Strengthen `src/geometry.test.ts` to verify first-entry crossing behavior.
3. Add focused contract coverage for retained event IDs, types, timestamps, and
   HUD timeline validation at existing test seams.
4. Run the focused Vitest coverage, then `npm test`.
5. Run `npm run build` to validate strict TypeScript compilation.
