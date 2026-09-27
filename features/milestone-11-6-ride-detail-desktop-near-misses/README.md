# Milestone 11.6 — Trailhunt Ride Detail Desktop / Near Misses

## Goal

Add a functional desktop Near Misses tab to the shared Trailhunt Ride Detail
screen. It must present only the canonical near-miss snapshot that belonged to
the selected historical ride, with Figma as the presentation source of truth
and the existing application as the source of truth for all domain behavior.

## Scope

This feature covers the Figma frame **Ride Detail / Near Misses** (`44:1786`)
in the Trailhunt design file:

- shared ride summary, progression card, and Ride Detail tabs;
- an active Near Misses tab with its count;
- nearby-target heading, supporting copy, rarity-colored target cards, and
  concise positive empty state;
- desktop spacing, typography, borders, radii, and visual density matching the
  selected Figma frame.

Video, World, Progress, Profile, Add Ride redesign, mobile, FIT parsing,
activity processing, collectible trigger semantics, progression, replay engine,
GoPro synchronization, and FFmpeg rendering are out of scope.

## Decisions

- Reuse one `RideDetailPage`, its existing activity/progress loading, selected
  activity ID, loading/error behavior, `RideSummary`, `RideProgress`, and
  `RideTabs`. Switching among Replay, Collected, and Near Misses reuses the
  already loaded activity and must not reload the page.
- Keep Video disabled for this milestone.
- A near miss remains a motivational post-ride discovery opportunity, never a
  failed collection, negative event, penalty, or XP award.
- Use only `replay_snapshot.activityResult.nearMisses` for historical
  presentation. Do not recalculate a historical route against the current
  world configuration.
- `minimumDistanceMeters` means the minimum route-to-collectible-center
  distance. Display it only with that semantic meaning; never present it as
  distance outside the trigger radius or as an arbitrary rider distance.
- Reuse the canonical rarity system (`common`, `rare`, `epic`) and the existing
  rarity badge behavior. Do not introduce tiers.
- Do not render XP/value for near misses. Although the snapshot carries
  collectible value, a near miss earns no XP and the selected Figma card does
  not display it.
- Omit collectible type and location/region because the persisted near-miss
  presentation record does not carry them and the selected frame does not need
  them.

## Historical data contract

Near misses are derived while a new activity is processed. They are uncollected
candidate collectibles whose closest route-to-center distance is at most the
canonical 100m near-miss threshold; results are nearest-first and capped at
five. This does not alter exact collectible collection, which continues to use
the collectible trigger radius.

Current completed rides persist the versioned replay snapshot, including the
canonical `activityResult.nearMisses` array, in
`activities.replay_snapshot`. This preserves historical names, rarity, value,
and closest distance despite later world changes.

Legacy rides without a complete replay snapshot cannot be reproduced exactly.
They must display a factual unavailable state rather than a list recomputed from
today's collectible locations, radii, names, rarity, or existence. No additive
persistence migration is required for new rides because the required canonical
snapshot is already persisted; snapshot-less historical data cannot be safely
backfilled without a retained historical world snapshot.

## Implementation plan

1. Add `NearMissesTab`, `AlmostGotTheseSection`, `NearMissList`, and
   `NearMissItem` components that consume only a validated v1 replay snapshot.
2. Make Near Misses selectable in the existing `RideTabs`, with its persisted
   count; preserve the active-state treatment and leave Video disabled.
3. Reuse compatible shared rarity presentation helpers. Do not reuse the
   collected-item card because its type and `+XP` presentation are false for
   near misses.
4. Add selected-frame-aligned styles for the heading, supporting text,
   74px target cards, 40px dashed rarity-colored target marker, rarity badge,
   “Next ride” label, and empty/unavailable states using existing design tokens.
5. For a persisted zero-length near-miss array, render concise factual positive
   empty copy. For legacy records without a complete snapshot, render a
   distinguishable historical-data-unavailable state and never derive a
   fallback list.
6. Add focused UI tests for snapshot-only rendering, canonical rarity safety,
   distance wording, no XP output, zero results, legacy unavailability, and
   tab switching. Extend persistence coverage if needed to prove a non-empty
   snapshot round-trips unchanged.

## Acceptance criteria

- Near Misses is a functional Ride Detail tab and uses the same loaded activity
  as Replay and Collected.
- Only real persisted near misses are shown; none is shown as collected.
- Opening or rendering the tab does not award XP or mutate progression.
- Names, rarities, and type-independent marker presentation come from canonical
  snapshots; unsupported type/region fields are absent.
- Any displayed distance is the canonical minimum route-to-center distance.
- Zero-near-miss snapshots and snapshot-less legacy rides have intentional,
  factual states.
- Replay and Collected still behave unchanged after tab switching, and Home,
  Rides, and Add Ride retain their behavior.

## Validation

Run focused component tests, relevant activity/persistence tests, the TypeScript
build, and the existing full test suite. Run the application against persisted
rides to verify Near Misses, Replay, Collected, Home, Rides, and Add Ride;
compare the desktop Near Misses surface to Figma and document any intentional
deviations.

## Implementation record

- Added the local Near Misses tab state to the shared Ride Detail shell. It
  reuses the already-loaded activity and progress records; Video remains
  disabled.
- Added snapshot-only near-miss sections and cards. Each card presents the
  persisted name, canonical rarity when available, and the rounded persisted
  minimum route-to-center distance; it does not display XP, collectible type,
  or location.
- Added explicit factual empty and legacy-unavailable states. Invalid or
  incomplete replay snapshots do not produce a recomputed or partial list.
- Reused the shared canonical rarity guard and Figma-exported target-vector
  assets, preserving the 40 px marker container and explicitly sized 13 px,
  8 px, and 4 px vector leaves.
- Added focused Ride Detail rendering/validation coverage and a persisted
  non-empty near-miss snapshot fixture. Validation runs are recorded with the
  implementation change.
