# Milestone 15.1 — Native MapLibre Collectible Rendering

## Goal

Render World collectibles natively through MapLibre so that every collectible marker
is anchored to its geographic coordinate at all times. Marker positions must be
produced by MapLibre's own projection, not by DOM overlays laid out in the page.

This milestone changes only how geographic collectible markers are rendered. World
gameplay, collectible business logic, collectible IDs, visited/unvisited semantics,
rarity logic, the World API, bbox querying, quest logic, quest progress, the
activity → quest flow, persistence, XP, marker click semantics, and the detail
overlay design all stay as implemented in Milestone 15.

## Problem

Collectibles were rendered as MapLibre HTML markers, one `<button class="world-marker">`
DOM node per collectible. Two defects made them appear to drift during zoom:

1. **CSS position override.** `maplibre-gl.css` defines
   `.maplibregl-marker { position: absolute; top: 0; left: 0; }`. `public/styles/world.css`
   defined `.world-marker { position: relative; … }`. Both selectors have identical
   specificity and `world.css` is linked after `maplibre-gl.css`, so `position: relative`
   won. Because the custom element *is* the marker element, every marker left absolute
   positioning and was laid out in normal document flow, stacking inside the marker
   container. MapLibre still wrote `transform: translate(-50%, -50%) translate(Xpx, Ypx)`
   every frame, but that transform was applied relative to each marker's flow position
   instead of the map origin. The result was a constant, non-geographic per-marker pixel
   offset: the transform tracked the map while the flow offset did not, so markers slid
   relative to the terrain during zoom, with an error that differed per marker and changed
   whenever the marker set changed.
2. **Full marker churn on every render.** The World page created a new element for every
   collectible on every render, so the marker diff never matched and all markers were
   removed and re-added after each viewport fetch, filter change and selection change.
   Re-added markers were positioned only on the next update tick, producing a visible
   flash and unstable stacking order.

Rendering the collectibles in WebGL removes both causes: projection happens natively and
there is no DOM layout involved.

## Scope

In scope:

- One canonical MapLibre GeoJSON source for the visible collectibles.
- Native circle layers with data-driven styling for visited, rarity and selected state.
- Collectible click handling through MapLibre layer events.
- Pointer cursor on hover over the collectible layers.
- Existing World filters continue to drive the source data.
- Source updates through `setData()` when viewport data changes.
- Removal of the collectible DOM marker machinery.
- A visually-hidden, keyboard-accessible collectible list replacing the focusable markers.

Out of scope: full World visual redesign, a new map theme, a custom Staza icon set,
clustering, Fog of War, regions, PostGIS, new collectible categories, new filters,
route generation, and navigation.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Layer type | **Circle layers** now, with a symbol-ready architecture | The existing marker artwork is SVG; symbol layers would require an SVG→raster sprite pipeline, which is disproportionate for a rendering migration. `category` is already a feature property, so a symbol layer can be added later without a data-model change. |
| Selected state | **Feature property `selected` + `setData()`**, with a filtered emphasis layer | The World page already re-renders the full collectible set on selection change. `setFeatureState` would have to be re-applied after every `setData`, which is strictly more moving parts. `promoteId: "id"` is still set so feature-state remains an easy future switch. |
| Filtering | Business filtering stays in `filteredWorldCollectibles`; already-filtered features are pushed via `setData` | Avoids duplicating filter semantics in two places. Layer filters are used only for the presentational `selected` emphasis. |
| Accessibility | Visually-hidden collectible button list in the map shell | WebGL circles are not focusable; the hidden list preserves keyboard and screen-reader access without any DOM positioning. |
| Legend | Legend swatches adjusted to match the circle rendering | The legend previously described the DOM marker artwork. |

## Data model

Source `staza-collectibles`:

```js
{
  type: "geojson",
  promoteId: "id",            // keeps future feature-state usage open
  data: { type: "FeatureCollection", features: [...] }
  // cluster: true can be enabled later without changing the feature shape
}
```

Feature shape:

```js
{
  type: "Feature",
  id: collectible.id,
  geometry: { type: "Point", coordinates: [collectible.longitude, collectible.latitude] },
  properties: {
    id: collectible.id,
    name: collectible.name,
    category: collectible.type,      // coin | landmark | future Staza categories
    rarity: canonicalRarity(collectible.rarity) ?? "common",
    visited: Boolean(collectible.found),
    selected: Boolean(selection is this collectible)
  }
}
```

Coordinates stay canonical `[longitude, latitude]`. Geographic positions are never
converted into CSS pixel coordinates.

## Layers

Two layers, both fed by the single source, added after the quest route layers:

```text
basemap → quest route casing → quest route line → collectibles → selected emphasis
```

| Layer id | Type | Purpose |
|---|---|---|
| `staza-collectibles` | circle | All collectible markers, fully data-driven styling |
| `staza-collectibles-selected` | circle | Selection emphasis ring, `filter: ["==", ["get", "selected"], true]` |

Data-driven paint on `staza-collectibles`:

- `circle-radius`: stable base radius, lightly interpolated by zoom for legibility.
- `circle-color` / `circle-opacity`: visited renders solid, unvisited renders dimmed,
  preserving the previous visual meaning.
- `circle-stroke-color`: matched on rarity using the existing rare/epic hues.
- `circle-stroke-width`: slightly thicker for rare and epic.

A `category`-keyed symbol layer can later be added to the same source without changing
the data model.

## Implementation plan

1. **`public/components/world/collectible-features.js` (new).** Pure
   `collectiblesToFeatureCollection(collectibles, { selectedId })` and `collectibleFeature()`.
   No MapLibre import, so it is unit-testable in isolation.
2. **`public/components/world/collectible-layers.js` (new).** Source and layer ids, paint
   expressions, `ensureCollectibleLayers(map)`, `setCollectibleData(map, featureCollection)`
   and `bindCollectibleInteractions(map, { onSelect })`. All functions take a map-like
   object so tests need only a narrow fake.
3. **`public/components/world/world-map.js`.** Drop `maplibre.Marker` usage and the marker
   registry; add the collectible source and layers after the route layers; expose
   `setCollectibles(featureCollection)`; wire `click`, `mouseenter` and `mouseleave` on the
   collectible layers to `onCollectibleSelect`; clean up in `destroy()`. Cache the latest
   FeatureCollection and re-apply it once the style is ready, reusing the existing
   `styleReady` / `ensure…Layers()` pattern.
4. **`public/components/world-page.js`.** Replace `renderMarkers()` with
   `renderCollectibles()`, building GeoJSON from the same merged and filtered collectible
   array (viewport collectibles filtered by the active filter, merged with the selected
   quest's collectibles). Pass `onCollectibleSelect: selectCollectible` into
   `createWorldMap`. `selectCollectible(id)` stays the single selection entry point,
   including its toggle-off behavior.
5. **Accessibility.** Render a visually-hidden list of collectible buttons inside the map
   shell, reusing `markerLabel` and `selectCollectible`.
6. **Cleanup.** Remove `createMarkerElement`, `markerClassName` and `markerInnerHtml` from
   `public/components/world/world-markers.js` (keeping `WorldLegend`, `WorldMapEmptyState`
   and `markerLabel`), remove the `.world-marker` rules from `public/styles/world.css`
   including the `position: relative` that caused the drift and the
   `.world-marker:focus-visible` fragment, and update the legend swatches.

The collectible detail panel, quest detail panel, quest list and editor, filters, legend,
locate control, status line, viewport stats, and the quest route source and layers are all
retained.

## Acceptance criteria

- Collectibles are rendered by MapLibre layers from a single GeoJSON source; no DOM node
  is created per collectible.
- Markers stay fixed to their geographic location during zoom, pan, `flyTo`, `fitBounds`
  and browser resize.
- Visited and unvisited collectibles remain visually distinct; rare and epic remain
  visually distinct; the selected collectible remains clearly emphasized and geographically
  anchored.
- Clicking a collectible feature selects the matching collectible and opens the existing
  detail overlay with unchanged semantics.
- Hovering a collectible layer shows a pointer cursor on desktop.
- The All, Found, Unfound, Rare and Epic filters continue to work, driven by the existing
  business filtering only.
- Viewport data changes update the existing source through `setData()`; the map, source and
  layers are not recreated.
- Quest routes keep their current behavior, and route geometry and collectible points stay
  aligned during map movement.
- Collectibles remain reachable by keyboard and screen readers through the visually-hidden
  list and the existing detail UI.
- The GeoJSON source architecture allows enabling clustering later without a data-model
  change.

## Validation

Unit tests:

- `public/components/world/collectible-features.test.js` — API collectibles convert to a
  `FeatureCollection` of `Point` features; coordinate order is `[longitude, latitude]`;
  `visited` mirrors `found`; `rarity` is preserved and unknown values normalize to `common`;
  `category`, `name` and feature `id` are preserved; filter state is preserved for all five
  filters; `selected` is true for exactly the selected id.
- `public/components/world/collectible-layers.test.js` — `ensureCollectibleLayers` adds the
  source once and is idempotent; viewport updates call `setData` on the existing source
  rather than re-adding source or layers; a synthesized layer `click` event invokes
  `onSelect` once with the clicked feature id; hover sets and clears the pointer cursor.
- `public/components/world-page.test.js` — the rendering path produces GeoJSON features and
  no DOM collectible marker layer remains.
- `public/components/world/quest-ui.test.js` — obsolete `markerClassName` coverage removed.

No MapLibre library mock is required, because all MapLibre-touching logic sits behind small
functions that accept a map-like object.

Browser validation checklist:

1. Open World and confirm the real OpenFreeMap basemap renders.
2. Confirm collectibles render.
3. Zoom in repeatedly and zoom out repeatedly.
4. Pan in all directions.
5. Confirm each collectible stays on the same geographic location.
6. Use fly-to from a quest detail and confirm markers stay fixed.
7. Exercise the Found, Unfound, Rare and Epic filters.
8. Click a collectible and confirm the correct detail overlay opens.
9. Select a quest and confirm the route and collectibles align.
10. Resize the browser and confirm no marker drift.
11. Confirm zero console errors.
