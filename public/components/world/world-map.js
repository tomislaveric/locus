const MAPLIBRE_MODULE = "/shared/maplibre/maplibre-gl.mjs";

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

/**
 * Thin MapLibre wrapper. It owns projection, viewport events, and layer plumbing
 * only; Staza gameplay rules stay in the World page.
 */
export const createWorldMap = async (container, { styleUrl, attribution, onViewportChange }) => {
  const maplibre = await import(MAPLIBRE_MODULE);
  const map = new maplibre.Map({
    container,
    style: styleUrl,
    center: [DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude],
    zoom: DEFAULT_ZOOM,
    attributionControl: false
  });
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibre.AttributionControl({ compact: true, customAttribution: attribution }), "bottom-right");

  const markers = new Map();
  let styleReady = false;

  const addMarker = (entry) => new maplibre.Marker({ element: entry.element })
    .setLngLat([entry.longitude, entry.latitude]).addTo(map);

  const ensureRouteLayers = () => {
    if (map.getSource(ROUTE_SOURCE)) return;
    map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeToGeoJson() });
    map.addLayer({
      id: `${ROUTE_SOURCE}-casing`,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#0b0c0f", "line-opacity": 0.55, "line-width": 7 }
    });
    map.addLayer({
      id: `${ROUTE_SOURCE}-line`,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#e8b80a", "line-opacity": 0.9, "line-width": 3 }
    });
  };

  await new Promise((resolve) => {
    map.on("load", () => {
      styleReady = true;
      ensureRouteLayers();
      resolve();
    });
  });

  map.on("moveend", () => onViewportChange(readBounds(map)));

  return {
    map,
    getBounds: () => readBounds(map),
    setMarkers(entries) {
      const seen = new Set();
      for (const entry of entries) {
        seen.add(entry.id);
        const existing = markers.get(entry.id);
        if (existing && existing.element === entry.element) {
          existing.marker.setLngLat([entry.longitude, entry.latitude]);
          continue;
        }
        if (existing) existing.marker.remove();
        markers.set(entry.id, { element: entry.element, marker: addMarker(entry) });
      }
      for (const [id, entry] of markers) {
        if (seen.has(id)) continue;
        entry.marker.remove();
        markers.delete(id);
      }
    },
    setRoute(route) {
      if (!styleReady) return;
      ensureRouteLayers();
      map.getSource(ROUTE_SOURCE).setData(routeToGeoJson(route));
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
      map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 600 });
    },
    flyTo(longitude, latitude, zoom) {
      map.flyTo({ center: [longitude, latitude], zoom: zoom ?? Math.max(map.getZoom(), 13), duration: 600 });
    },
    destroy() {
      for (const entry of markers.values()) entry.marker.remove();
      markers.clear();
      map.remove();
    }
  };
};
