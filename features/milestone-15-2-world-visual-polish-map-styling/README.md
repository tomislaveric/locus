# Milestone 15.2 — World Visual Polish & Map Styling

## Goal

Make the World feel unmistakably like Staza: a premium outdoor discovery map with
game-like progression, where the basemap is supporting context and Staza collectibles,
quests and routes are the visual focus.

## Problem

World v1 is functionally correct and 15.1 made collectible rendering MapLibre-native, but
the screen still reads as "OpenFreeMap Liberty plus some markers". Liberty is a *light*
cartographic style dropped into a dark premium app shell, and its road network visually
outranks Staza content.

This milestone is visual only. No gameplay, API, persistence, quest, filter, XP or
selection behaviour changes.

## 1. Current map style architecture

- `src/config.ts` → `basemapStyleUrl` (`BASEMAP_STYLE_URL`, default
  `https://tiles.openfreemap.org/styles/liberty`), `basemapAttribution`,
  `basemapExtraOrigins`.
- `src/basemap.ts` → `getBasemapConfig()` returns `{ styleUrl, attribution }`;
  `getBasemapOrigins()` feeds CSP `imgSrc`/`connectSrc` in `src/server.ts`.
- `GET /api/world/basemap` (auth-gated) hands that config to the client.
- `public/components/world-page.js` fetches it and passes `styleUrl` + `attribution` into
  `createWorldMap()`.
- `public/components/world/world-map.js` constructs `new maplibre.Map({ style: styleUrl })`,
  adds `NavigationControl` and `AttributionControl`, then on `load` adds the quest route
  source/layers and (since 15.1) the collectible source/layers.

So the provider boundary is already clean: World code never names OpenFreeMap. Nothing
today modifies the style itself.

## 2. How Liberty is loaded today

MapLibre receives the style **URL** and fetches/parses it internally. The app never sees
the style document, so there is currently no seam for restyling. Liberty contains 111
layers over two sources (`openmaptiles` vector, `ne2_shaded` raster), with remote
`sprite` and `glyphs`.

Relevant current values: `background #f8f4f0`, `water rgb(158,189,255)`,
`landcover_wood hsla(98,61%,72%,0.7)`, `park #d8e8c8`, `building hsl(35,8%,85%)`,
`road_minor #fff`, `road_trunk_primary #fea`, `road_motorway #fc8`, place labels `#000`
with white halos, and three POI label layers (`poi_r1`, `poi_r7`, `poi_r20`).

## 3. Proposed Staza basemap styling approach

**Decided: a runtime theme-transform module** — `public/components/world/staza-map-theme.js`.

```text
OpenFreeMap vector tiles
  → fetch(styleUrl) → Liberty style JSON
  → applyStazaMapTheme(style, palette)   ← declarative, category-keyed rules
  → new maplibre.Map({ style: themedStyle })
  → Staza gameplay overlays (route, collectibles, selection)
```

- `createWorldMap()` fetches the style document, applies the theme, and passes the
  resulting **object** to MapLibre. If the fetch or transform throws, it falls back to
  passing the original `styleUrl`, so a provider hiccup degrades to today's map instead of
  breaking World. CSP already allows the basemap origin in `connectSrc`.
- `applyStazaMapTheme(style, palette)` is a pure function: style document in, new style
  document out. It classifies each layer by id/`source-layer` into a small set of
  categories and applies palette-driven paint overrides. It never touches `sources`,
  `sprite`, `glyphs`, layer order, filters or zoom ranges except where explicitly listed.
- The palette is a single exported object (`STAZA_DARK_PALETTE`). A future Staza Light
  theme is a second palette passed to the same function — no World code changes.
- Rationale over vendoring a style JSON: 111 layers frozen in the repo would drift from
  the provider, bloat review, and still need editing for a second theme. ~60 lines of
  declarative rules is far more maintainable and keeps the provider replaceable.

## 4. Exact basemap layers to mute / change

Category-keyed rules (layer ids from Liberty):

| Category | Layers | Treatment |
|---|---|---|
| Background | `background` | `#0f1114` (between canvas and surface tokens) |
| Relief | `natural_earth` | Desaturate and darken: `raster-saturation -0.7`, `raster-brightness-max 0.35`, opacity halved |
| Water | `water`, `waterway_river`, `waterway_other`, `waterway_tunnel` | Muted deep steel-blue `#16242e` / lines `#1d3140` — recognizable, never bright |
| Nature | `park`, `park_outline`, `landcover_wood`, `landcover_grass`, `landcover_wetland`, `landcover_sand`, `landcover_ice` | Muted earthy greens `#16211b` / `#19241c`, low opacity; parks keep a faint outline so green space stays legible |
| Landuse | `landuse_residential`, `landuse_pitch`, `landuse_track`, `landuse_cemetery`, `landuse_hospital`, `landuse_school`, `aeroway_fill` | Near-background `#121317`, very low contrast |
| Buildings | `building` | Fill `#15171c`, outline `rgb(255 255 255 / 4%)`; `building-3d` left disabled as today |
| Major roads | `road_motorway`, `road_trunk_primary`, `bridge_*`/`tunnel_*` equivalents | `#3a3e46`, readable but never white |
| Minor roads | `road_minor`, `road_link`, `road_service_track`, `road_secondary_tertiary` | `#25282e`, clearly subordinate |
| Paths | `road_path_pedestrian`, `tunnel_path_pedestrian`, `bridge_path_pedestrian` | `#33373f` — deliberately *not* muted below minor roads, since trails matter for outdoor discovery |
| Road casings | all `*_casing` | Darkened to `#0f1114` so roads read as engraved rather than stacked |
| Rail | `*_major_rail*`, `*_transit_rail*` | Dimmed to `#23262c` |
| Boundaries | `boundary_2`, `boundary_3`, `boundary_disputed` | `rgb(255 255 255 / 10%)`, thin |
| Place labels | `label_country_*`, `label_state`, `label_city`, `label_city_capital`, `label_town`, `label_village`, `label_other` | Text `#c9c4bb` (cities) / `#8a9099` (smaller), halo `#0b0c0f` — orientation preserved |
| Road labels | `highway-name-major`, `highway-shield-*`, `road_shield_us` | Dimmed text `#7c828c`, dark halo |
| Clutter (hidden) | `poi_r1`, `poi_r7`, `poi_r20`, `poi_transit`, `highway-name-minor`, `road_one_way_arrow`, `road_one_way_arrow_opposite`, `road_area_pattern` | `layout.visibility = "none"` |
| Water labels | `water_name_point_label`, `water_name_line_label`, `waterway_line_label` | Muted blue-grey `#6f8794`, dark halo |

Unknown/unmatched layers keep their Liberty paint, so a provider style update can only
under-theme, never crash the map.

## 5. Proposed collectible visual states

Keep the 15.1 circle architecture and single source. One consistent vocabulary:

**Fill encodes discovery. Stroke encodes rarity.**

| State | Fill | Stroke |
|---|---|---|
| Unvisited common | `#171a20` @ .88 | `#7c828c`, 1.6 |
| Unvisited rare | `#171a20` @ .88 | `--accent-rare` `#4d9de0`, 2.2 |
| Unvisited epic | `#171a20` @ .88 | `--accent-epic` `#9b6ddf`, 2.2 |
| Visited common | `--accent-yellow` `#e8b80a` | `#0b0c0f`, 1.6 |
| Visited rare | `#e8b80a` | `#4d9de0`, 2.2 |
| Visited epic | `#e8b80a` | `#9b6ddf`, 2.2 |

Unvisited stays clearly discoverable ("something is here") without looking disabled;
visited reads instantly as gold reward; rarity is a ring rather than a second fill, so the
map never becomes a field of bright tokens.

## 6. Proposed selected-marker treatment

Three cooperating pieces, all geographically anchored, no animation:

1. The existing `staza-collectibles-selected` halo layer, restyled: a wider gold ring with
   a translucent gold fill (`circle-opacity` ~.14, `circle-stroke-width` 2, gold stroke).
2. A second, wider and fainter gold ring for a soft glow (one extra circle layer, still
   the same source and filter).
3. The main circle grows slightly when `selected` is true via a `case` expression, so the
   selected collectible reads as raised rather than merely outlined.

## 7. Proposed quest-active treatment

- `collectiblesToFeatureCollection` gains a presentational `questRelated` boolean
  (derived from the already-loaded `selectedQuest.collectibles` ids — no new data, no
  business logic).
- When a quest is active, unrelated collectibles drop to ~45% opacity through a
  data-driven `case` on `questRelated`; quest collectibles keep full strength and gain a
  faint gold outer ring so route + markers read as one experience.
- Unrelated collectibles stay in the source and stay clickable — no hidden state.
- With no quest selected, `questRelated` is `true` for everything, so the default
  hierarchy is unchanged.

## 8. Proposed quest route style

Replace the flat casing+line pair with a three-part Staza route, same source, same data:

1. `…-glow`: wide gold line, very low opacity — lifts the route off the dark basemap.
2. `…-casing`: near-black, slightly wider than the line, for contrast over any terrain.
3. `…-line`: `--accent-yellow`, round caps/joins, width zoom-interpolated (thinner when
   zoomed out, ~4–5px at exploration zooms).

Route geometry is never fabricated; quests with only an external link still render no line.

## 9. Proposed legend simplification

Current legend mixes obsolete coin/landmark SVG icons with a dashed "unvisited" ring that
no longer matches the rendered circles. Replace with exactly the four concepts the map
actually encodes, using the *same* swatch vocabulary:

```text
● Visited    ○ Unvisited    ○ Rare (blue ring)    ○ Epic (purple ring)
```

- Category icons removed (they describe an icon system this milestone deliberately does
  not build).
- A shared `CollectibleSwatch()` helper renders both the legend swatches and the quest
  detail collectible rows, guaranteeing one vocabulary between map and panel (Step 28).
- Compact dark surface, existing typography, positioned so it does not cover map content.

## 10. Proposed zoom-dependent behaviour

Simple MapLibre expressions only:

- `circle-radius`: `interpolate linear zoom` — ~4px at z9, 7px at z12, 10px at z15, 12px
  at z17. Far out stays readable but uncluttered; close in stays crisp.
- `circle-stroke-width`: scales modestly with zoom so rings do not dominate small circles.
- Selected halo radii interpolate on the same curve so emphasis stays proportional.
- Route line width interpolates with zoom.

No JS zoom listeners, no clustering, no per-frame work.

## 11. Proposed layer order

```text
basemap fills → basemap roads → basemap labels
  → staza-quest-route-glow
  → staza-quest-route-casing
  → staza-quest-route-line
  → staza-collectibles
  → staza-collectibles-selected-glow
  → staza-collectibles-selected
```

Staza layers are appended on top, matching the required hierarchy (selected > route >
collectibles > basemap labels > minor detail). Basemap clutter is reduced in the theme
rather than by re-ordering provider layers, which keeps the transform resilient.

## 12. Files to modify

| File | Change |
|---|---|
| `public/components/world/world-map.js` | Fetch + theme the style with URL fallback; restyle route into glow/casing/line; add fly-to/fit framing that accounts for the detail panel; keep control setup and `styleReady` flow |
| `public/components/world/collectible-layers.js` | New data-driven paint (fill=visited, stroke=rarity), zoom interpolation, quest dimming, selected glow layer |
| `public/components/world/collectible-features.js` | Add presentational `questRelated` property |
| `public/components/world-page.js` | Pass quest collectible ids into the feature builder; pass panel-aware framing options; viewport stats markup tweak |
| `public/components/world/world-markers.js` | Legend rebuilt on `CollectibleSwatch`; category icons removed |
| `public/components/world/quest-detail.js` | Collectible rows use `CollectibleSwatch` so panel matches map |
| `public/styles/world.css` | Legend, viewport stats strip, locate/zoom/attribution control styling, detail panel width & scroll, responsive checks |
| `public/styles/design-tokens.css` | Add `--world-map-surface` and `--world-marker-ring`; drop the now-unused `--world-marker-unfound` |

## 13. New files

- `public/components/world/staza-map-theme.js` — `STAZA_DARK_PALETTE`, `applyStazaMapTheme(style, palette)`, and the category classifier.
- `public/components/world/collectible-swatch.js` — `CollectibleSwatch()`, the marker
  vocabulary shared by the legend and the quest collectible rows.
- `public/components/world/staza-map-theme.test.js`
- `public/components/world/world-map.test.js` — covers style loading with fallback and the
  quest route layer stack.

## 14. Tests to update / add

Behavioural, not pixel-perfect:

- **`staza-map-theme.test.js`** — themed background/water/road colours come from the
  palette; POI/one-way/minor-road-name layers become invisible; place labels stay visible;
  layer count and order are unchanged; `sources`, `sprite`, `glyphs` untouched; the input
  style object is not mutated; unknown layers pass through unchanged.
- **`collectible-features.test.js`** — `questRelated` is true for quest collectibles and
  false for others when a quest is active, and true for everything when none is; existing
  coordinate/visited/rarity/filter/selected assertions unchanged.
- **`collectible-layers.test.js`** — selected glow layer exists, is filtered on `selected`,
  and is added above the base collectible layer; radius/stroke paint are zoom
  interpolations; fill is driven by `visited` and stroke by `rarity`; opacity is driven by
  `questRelated`; existing idempotency/`setData`/click/hover assertions unchanged.
- **`world-map.js` route** — route layers are created in glow → casing → line order (via
  the existing fake-map style test harness).
- **`quest-ui.test.js`** — quest collectible rows render the shared swatch with the
  correct visited/rarity state.

## 15. Risks to current World functionality

| Risk | Mitigation |
|---|---|
| Style fetch fails or provider changes its document shape | `try/catch` around fetch+transform; fall back to the plain `styleUrl`. Unknown layers pass through untouched. |
| CSP blocks fetching the style JSON | Basemap origin is already in `connectSrc` (`src/server.ts`); verified before implementing. |
| Over-muting harms orientation | Place labels, major roads, paths, water and forests are explicitly preserved; only POI/one-way/minor-road-name clutter is hidden. |
| Attribution regression | `AttributionControl` untouched; styling only, never hidden — verified in the browser pass. |
| Quest dimming becomes hidden state | Unrelated collectibles stay in the source, stay clickable and stay in the accessible list; only opacity changes. |
| Keyboard access regression | The visually-hidden collectible list from 15.1 is untouched; selection keeps a single canonical handler. |
| Fly-to framing changes feel jumpy | Padding/offset only, existing durations kept; no new camera triggers. |
| Theme work leaking into unrelated components | All basemap styling lives in `staza-map-theme.js`; gameplay colours stay tied to design tokens. |

## Implementation steps

1. Audit current World visuals and decide directions.
2. `staza-map-theme.js` with palette, classifier and pure transform.
3. Load, theme and fall back in `world-map.js`.
4. Glow/casing/line quest route with zoom-aware width.
5. Visited/unvisited/rarity/zoom paint in `collectible-layers.js`.
6. Selected glow layer and raised selected circle.
7. `questRelated` property plus dimming of unrelated collectibles.
8. Shared swatch, rebuilt legend, quest row parity.
9. Viewport stats strip, controls, detail panel width/scroll, fly-to framing, responsive.
10. Add/update the suites in section 14.
11. Run the Step 37 checklist.

## Acceptance criteria

All World behaviour from Milestone 15 and 15.1 is preserved: the World API, bbox queries,
collectible and quest persistence, collectible ids, quest progress, the activity to quest
flow, external route handling, visited/unvisited truth, rarity semantics, authentication,
ownership, XP, GameEvents, filters, and the MapLibre source architecture are unchanged.

In addition:

- The basemap reads as a muted dark Staza surface while cities, towns, major roads, paths,
  water and forests stay readable.
- Visited, unvisited, rare and epic collectibles are distinguishable at a glance, and the
  selected collectible is obvious and stays geographically anchored.
- Selecting a quest emphasises its route and collectibles while unrelated collectibles stay
  visible and clickable; closing the quest restores the default hierarchy.
- The legend shows only concepts the map actually renders and uses the same swatches.
- Markers stay uncluttered when zoomed out and crisp when zoomed in, with no drift.
- Viewport stats stay viewport-scoped and the header counter stays global.
- Locate Me works, attribution stays visible, and keyboard collectible selection still works.
- Rendering stays MapLibre-native with no DOM marker loops or animation loops.

## Notes

- Out of scope: Fog of War, regions, PostGIS, clustering, icon sprite pipeline, automatic
  import, route generation, navigation, integrations, social, achievements, new quest or
  collectible logic, and the Light theme.
- Symbol icons are deliberately not introduced; the circle system is made premium first.
- Decisions confirmed: runtime theme transform, dark muted tone, dim-but-clickable
  unrelated collectibles during a quest, and panel-aware fly-to framing.
