# milestone-11-8-trailhunt-world-desktop

## Goal

Add a single desktop World browse surface that faithfully follows the Trailhunt Figma World states while using the application's configured collectible catalog and persisted player collection truth.

## Scope

- Implement one `WorldPage` with All, Found, Unfound, Rare, and Epic filter states.
- Reuse the existing application shell, sidebar, tokens, vanilla JavaScript component pattern, and CSS styling approach.
- Add a small player-scoped browse-world API that joins the current configured catalog with actual persisted collectible discoveries.
- Render real collectible coordinates in a dependency-free, stylized Figma-aligned world surface.
- Add loading, API-error, no-catalog, and per-filter empty states.

Out of scope: Progress, Profile, Add Ride redesign, mobile design, map SDKs/tiles, regional domain modeling, route-query changes, FIT/activity processing, collection triggers, GameEvents, progression, replay, video synchronization, highlight planning, and FFmpeg rendering.

## Figma references

- Canvas: `World Desktop` (`42:309`)
- `World / All` (`42:310`)
- `World / Found` (`44:2256`)
- `World / Unfound` (`44:2472`)
- `World / Rare` (`44:2680`)
- `World / Epic` (`44:2878`)

The shared design has an 896px World content column, `World` heading, `Explore your region` support copy, a discovered counter, five filter pills, a 896×520 dark stylized world/map panel, marker legend, and a lower statistics row.

## Decisions

- The initial World scope is the complete configured collectible catalog, not a new regional model.
- Rare and Epic tabs show all collectibles at that canonical rarity, including both found and unfound items.
- Found state comes only from persisted `collectible_collected` activity events for the current player. Geographic route proximity never makes an item found.
- Catalog-wide counts deduplicate persisted source IDs and intersect them with the active configuration so stale historical records cannot distort the totals.
- Filters reuse one loaded snapshot and derive presentation client-side without per-tab refetches.
- Coordinates are normalized only for visual placement; they do not alter configured collection radii or route-query padding.
- Figma's literal mock marker positions/totals are never copied into product data.

## Unsupported Figma concepts

The application has no canonical regions or targeting state. Therefore the World page will omit:

- Region labels and the `5 regions` statistic.
- The `Targeted` marker/legend state.

The implementation will report these intentional deviations rather than invent data.

## Future reveal and fog-of-war boundary

The World snapshot marks each collectible with a `visibility` state. In this milestone the server supplies `visible` for every configured catalog item, preserving current behavior. The page applies visibility before all presentation filters, so a future player-specific exploration or quest resolver can return `hidden` for unrevealed collectibles without changing Found, Unfound, Rare, or Epic semantics.

Future reveal logic integrates at the `createWorldSnapshot` visibility input and `/api/world` assembly point after it has independently computed route/area exploration and quest effects. It must not derive reveal state from collection events. No persistence tables, route-coverage calculations, tiles, map masking, or quest logic are introduced here. Product work will still need to decide whether global discovery totals remain visible when collectibles are hidden; current all-visible behavior keeps the existing catalog-wide totals.

## Implementation plan

1. Add typed, pure World read-model helpers that combine configured collectibles with a discovered source-ID set and derive totals, found/unfound state, remaining count, rare finds, and epic finds.
2. Add a repository query for distinct source IDs from the default player's persisted activity events.
3. Add `GET /api/world`, reading the full configured catalog and returning catalog items with derived `found` status and catalog-scoped statistics. Do not use `getRelevantCollectibles`.
4. Wire the existing World sidebar screen through the app dispatcher.
5. Create a `WorldPage` module with `WorldFilterTabs`, `WorldMap`, `WorldMarker`, `WorldLegend`, and `WorldStats`.
6. Implement a Figma-aligned dark spatial projection and marker treatments from real coordinates, type, rarity, found state, and local selection state. Download exact Figma assets only when no faithful local asset already exists.
7. Add focused server/model and page tests, update API documentation, and validate all five World tab states and existing app surfaces.

## Acceptance criteria

- World loads the complete configured catalog from one API snapshot.
- Found equals actual persisted collection truth; Unfound excludes every found catalog item.
- Rare and Epic use only canonical rarities and include found and unfound items.
- Discovered numerator is distinct player-discovered IDs intersected with the catalog; denominator is the catalog size.
- World uses no mock collectible coordinates, mock totals, or route-query bounds.
- Changing tabs does not refetch and preserves selection only while the selected marker remains visible.
- Empty, loading, and error states are usable and explicit.
- Existing Home, Rides, Ride Detail, Add Ride, collection processing, replay, and video behavior remain intact.

## Validation

- Run focused model, repository/API, and World page tests.
- Run the existing test suite and TypeScript build.
- Open each World tab and compare it with its related Figma frame.
- Verify real-data marker placement/state and all derived counts.
- Smoke-test Home, Rides, Ride Detail, and Add Ride.
- Document intentional omissions for regions and targeting.
