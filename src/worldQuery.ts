import type { Collectible, TrackPoint } from "./domain.js";

const METERS_PER_DEGREE_LATITUDE = 111_320;
const MINIMUM_COSINE = 1e-6;

export interface GeoBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

export const getRouteBounds = (route: TrackPoint[]): GeoBounds | undefined => {
  if (route.length === 0) return undefined;
  return route.reduce<GeoBounds>(
    (bounds, point) => ({
      minLatitude: Math.min(bounds.minLatitude, point.latitude),
      maxLatitude: Math.max(bounds.maxLatitude, point.latitude),
      minLongitude: Math.min(bounds.minLongitude, point.longitude),
      maxLongitude: Math.max(bounds.maxLongitude, point.longitude)
    }),
    {
      minLatitude: route[0].latitude,
      maxLatitude: route[0].latitude,
      minLongitude: route[0].longitude,
      maxLongitude: route[0].longitude
    }
  );
};

export const padGeoBounds = (bounds: GeoBounds, paddingMeters: number): GeoBounds => {
  const latitudePadding = paddingMeters / METERS_PER_DEGREE_LATITUDE;
  const centerLatitudeRadians = ((bounds.minLatitude + bounds.maxLatitude) / 2) * Math.PI / 180;
  const longitudePadding = paddingMeters / (
    METERS_PER_DEGREE_LATITUDE * Math.max(Math.abs(Math.cos(centerLatitudeRadians)), MINIMUM_COSINE)
  );
  return {
    minLatitude: Math.max(-90, bounds.minLatitude - latitudePadding),
    maxLatitude: Math.min(90, bounds.maxLatitude + latitudePadding),
    minLongitude: bounds.minLongitude - longitudePadding,
    maxLongitude: bounds.maxLongitude + longitudePadding
  };
};

export const getRelevantCollectibles = (
  allCollectibles: Collectible[],
  route: TrackPoint[],
  paddingMeters: number
): Collectible[] => {
  const bounds = getRouteBounds(route);
  if (!bounds) return [];
  return allCollectibles.filter((collectible) => {
    const paddedBounds = padGeoBounds(bounds, paddingMeters + collectible.radiusMeters);
    return collectible.latitude >= paddedBounds.minLatitude &&
      collectible.latitude <= paddedBounds.maxLatitude &&
      collectible.longitude >= paddedBounds.minLongitude &&
      collectible.longitude <= paddedBounds.maxLongitude;
  });
};
