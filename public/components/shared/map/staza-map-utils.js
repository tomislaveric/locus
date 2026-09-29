/**
 * Shared, presentation-only geographic helpers and layer-order conventions for the Staza
 * map. Both World and Activity Detail use these so bounds, empty-geometry handling and draw
 * order stay consistent instead of being re-derived per screen.
 */

export const readBounds = (map) => {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth()
  };
};

export const boundsToParameter = (bounds) => [
  bounds.west, bounds.south, bounds.east, bounds.north
].map((value) => value.toFixed(5)).join(",");

/** Quest route feature: geometry is preserved as-is and never fabricated. */
export const routeToGeoJson = (route) => ({
  type: "Feature",
  properties: {},
  geometry: route?.geometry ?? { type: "LineString", coordinates: [] }
});

/** A LineString feature from an ordered list of [longitude, latitude] pairs. */
export const lineFeature = (coordinates = []) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates }
});

/** A single Point feature; returns an empty collection-safe geometry when absent. */
export const pointFeature = (coordinate, properties = {}) => ({
  type: "Feature",
  properties,
  geometry: coordinate ? { type: "Point", coordinates: coordinate } : { type: "Point", coordinates: [] }
});

const isFinitePoint = (point) => Number.isFinite(point?.longitude) && Number.isFinite(point?.latitude);

/**
 * A `[[west, south], [east, north]]` bounding box from `{ longitude, latitude }` points, or
 * `undefined` when there is nothing to frame. Callers hand the result straight to
 * `map.fitBounds`, so empty geometry never throws.
 */
export const pointsToBounds = (points = []) => {
  const usable = points.filter(isFinitePoint);
  if (!usable.length) return undefined;
  return usable.reduce((box, point) => [
    [Math.min(box[0][0], point.longitude), Math.min(box[0][1], point.latitude)],
    [Math.max(box[1][0], point.longitude), Math.max(box[1][1], point.latitude)]
  ], [
    [usable[0].longitude, usable[0].latitude],
    [usable[0].longitude, usable[0].latitude]
  ]);
};

/**
 * Canonical draw order, bottom to top. Feature layers are inserted relative to these so
 * `beforeId` logic is not scattered across screens.
 *
 *   BASEMAP → ROUTE_BACKGROUND → ROUTE_PROGRESS → COLLECTIBLES → SELECTION → POSITION
 */
export const LAYER_ORDER = Object.freeze([
  "route-background",
  "route-progress",
  "collectibles",
  "selection",
  "position"
]);
