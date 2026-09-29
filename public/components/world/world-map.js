import { EMPTY_FEATURE_COLLECTION } from "./collectible-features.js";
import { bindCollectibleInteractions, ensureCollectibleLayers, setCollectibleData } from "./collectible-layers.js";
import { applyStazaMapTheme } from "./staza-map-theme.js";

const MAPLIBRE_MODULE = "/shared/maplibre/maplibre-gl.mjs";

/** Width reserved on the right for the detail panel so framing never hides the subject. */
const DETAIL_PANEL_INSET = 368;
const BASE_PADDING = 64;

export const DEFAULT_CENTER = { longitude: 8.4037, latitude: 49.0069 };
export const DEFAULT_ZOOM = 12;

export const boundsToParameter = (bounds) => [
  bounds.west, bounds.south, bounds.east, bounds.north
].map((value) => value.toFixed(5)).join(",");

export const readBounds = (map) => {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth()
  };
};

export const routeToGeoJson = (route) => ({
  type: "Feature",
  properties: {},
  geometry: route?.geometry ?? { type: "LineString", coordinates: [] }
});

const ROUTE_SOURCE = "staza-quest-route";
export const ROUTE_SOURCE_ID = ROUTE_SOURCE;

const routeWidth = (scale) => ["interpolate", ["linear"], ["zoom"], 8, 2 * scale, 12, 3.5 * scale, 16, 6 * scale];

const routeLine = (suffix, paint) => ({
  id: `${ROUTE_SOURCE}-${suffix}`,
  type: "line",
  source: ROUTE_SOURCE,
  layout: { "line-cap": "round", "line-join": "round" },
  paint
});

/** Glow, casing and line read as one deliberate Staza layer over any basemap. */
export const routeLayers = () => [
  routeLine("glow", { "line-color": "#e8b80a", "line-opacity": 0.16, "line-blur": 4, "line-width": routeWidth(3.2) }),
  routeLine("casing", { "line-color": "#0b0c0f", "line-opacity": 0.75, "line-width": routeWidth(1.9) }),
  routeLine("line", { "line-color": "#e8b80a", "line-opacity": 0.95, "line-width": routeWidth(1) })
];

/**
 * Loads the provider style document and returns it themed for Staza. Falls back to the
 * plain style URL so a provider or network hiccup degrades to the untouched basemap.
 */
export const loadStazaStyle = async (styleUrl, fetchImpl = fetch) => {
  try {
    const response = await fetchImpl(styleUrl);
    if (!response.ok) throw new Error(`Basemap style request failed with ${response.status}.`);
    return applyStazaMapTheme(await response.json());
  } catch {
    return styleUrl;
  }
};

/**
 * Thin MapLibre wrapper. It owns projection, viewport events, and layer plumbing
 * only; Staza gameplay rules stay in the World page.
 */
export const createWorldMap = async (container, { styleUrl, attribution, onViewportChange, onCollectibleSelect }) => {
  const maplibre = await import(MAPLIBRE_MODULE);
  const map = new maplibre.Map({
    container,
    style: await loadStazaStyle(styleUrl),
    center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
    zoom: DEFAULT_ZOOM,
    attributionControl: false
  });
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibre.AttributionControl({ compact: true, customAttribution: attribution }), "bottom-right");

  let styleReady = false;
  let pendingCollectibles = EMPTY_FEATURE_COLLECTION;
  let panelInset = 0;

  const framingPadding = () => ({
    top: BASE_PADDING,
    bottom: BASE_PADDING,
    left: BASE_PADDING,
    right: BASE_PADDING + panelInset
  });

  const ensureRouteLayers = () => {
    if (map.getSource(ROUTE_SOURCE)) return;
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeToGeoJson() });
    for (const layer of routeLayers()) map.addLayer(layer);
  };

  await new Promise((resolve) => {
    map.on("load", () => {
      styleReady = true;
      ensureRouteLayers();
      ensureCollectibleLayers(map);
      setCollectibleData(map, pendingCollectibles);
      resolve();
    });
  });

  if (onCollectibleSelect) bindCollectibleInteractions(map, { onSelect: onCollectibleSelect });

  map.on("moveend", () => onViewportChange(readBounds(map)));

  return {
    map,
    getBounds: () => readBounds(map),
    setCollectibles(featureCollection) {
      pendingCollectibles = featureCollection ?? EMPTY_FEATURE_COLLECTION;
      if (!styleReady) return;
      ensureCollectibleLayers(map);
      setCollectibleData(map, pendingCollectibles);
    },
    setRoute(route) {
      if (!styleReady) return;
      ensureRouteLayers();
      map.getSource(ROUTE_SOURCE).setData(routeToGeoJson(route));
    },
    setDetailPanelOpen(open) {
      panelInset = open ? DETAIL_PANEL_INSET : 0;
    },
    fitTo(points) {
      if (!points.length) return;
      const bounds = points.reduce(
        (accumulator, point) => accumulator.extend([point.longitude, point.latitude]),
        new maplibre.LngLatBounds(
          [points[0].longitude, points[0].latitude],
          [points[0].longitude, points[0].latitude]
        )
      );
      map.fitBounds(bounds, { padding: framingPadding(), maxZoom: 15, duration: 600 });
    },
    flyTo(longitude, latitude, zoom) {
      map.flyTo({
        center: [longitude, latitude],
        zoom: zoom ?? Math.max(map.getZoom(), 13),
        offset: [-panelInset / 2, 0],
        duration: 600
      });
    },
    destroy() {
      map.remove();
    }
  };
};
