import type { Collectible, TrackPoint } from "./domain.js";

const earthRadiusM = 6_371_000;

export const distanceMeters = (
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
): number => {
  const radians = Math.PI / 180;
  const latDelta = (latitudeB - latitudeA) * radians;
  const lonDelta = (longitudeB - longitudeA) * radians;
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latitudeA * radians) *
      Math.cos(latitudeB * radians) *
      Math.sin(lonDelta / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const minimumRouteDistanceMeters = (
  points: TrackPoint[],
  collectible: Pick<Collectible, "latitude" | "longitude">
): number => {
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  const radians = Math.PI / 180;
  const toLocal = (point: Pick<TrackPoint, "latitude" | "longitude">) => ({
    x: (point.longitude - collectible.longitude) * radians * earthRadiusM * Math.cos(collectible.latitude * radians),
    y: (point.latitude - collectible.latitude) * radians * earthRadiusM
  });
  const pointDistance = (point: Pick<TrackPoint, "latitude" | "longitude">) =>
    distanceMeters(point.latitude, point.longitude, collectible.latitude, collectible.longitude);
  let minimumDistance = pointDistance(points[0]);
  for (let index = 1; index < points.length; index += 1) {
    const before = toLocal(points[index - 1]);
    const after = toLocal(points[index]);
    const deltaX = after.x - before.x;
    const deltaY = after.y - before.y;
    const lengthSquared = deltaX ** 2 + deltaY ** 2;
    const projection = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(before.x * deltaX + before.y * deltaY) / lengthSquared));
    const closestX = before.x + deltaX * projection;
    const closestY = before.y + deltaY * projection;
    minimumDistance = Math.min(minimumDistance, Math.hypot(closestX, closestY));
  }
  return minimumDistance;
};

export const detectCollectiblePassage = (
  points: TrackPoint[],
  collectible: Collectible
): number | undefined => {
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index];
    const after = points[index + 1];
    const beforeDistance = distanceMeters(before.latitude, before.longitude, collectible.latitude, collectible.longitude);
    const afterDistance = distanceMeters(after.latitude, after.longitude, collectible.latitude, collectible.longitude);
    const beforeInside = beforeDistance <= collectible.radiusMeters;
    const afterInside = afterDistance <= collectible.radiusMeters;

    if (beforeInside || !afterInside) continue;

    const distanceChange = afterDistance - beforeDistance;
    const fraction =
      distanceChange === 0 ? 0 : (collectible.radiusMeters - beforeDistance) / distanceChange;
    return before.timestampMs + (after.timestampMs - before.timestampMs) * fraction;
  }
  return undefined;
};

export const detectFirstCollectiblePassages = (
  points: TrackPoint[],
  collectibles: Collectible[]
): Array<{ collectible: Collectible; timestampMs: number }> =>
  collectibles
    .map((collectible) => {
      const timestampMs = detectCollectiblePassage(points, collectible);
      return timestampMs === undefined ? undefined : { collectible, timestampMs };
    })
    .filter((passage): passage is { collectible: Collectible; timestampMs: number } => passage !== undefined)
    .sort((left, right) => left.timestampMs - right.timestampMs);

/** @deprecated Use detectCollectiblePassage. */
export const detectCoinPassage = detectCollectiblePassage;
/** @deprecated Use detectFirstCollectiblePassages. */
export const detectFirstCoinPassages = detectFirstCollectiblePassages;
