import type { Coin, TrackPoint } from "./domain.js";

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

export const detectCoinPassage = (
  points: TrackPoint[],
  coin: Coin
): number | undefined => {
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index];
    const after = points[index + 1];
    const beforeDistance = distanceMeters(before.latitude, before.longitude, coin.latitude, coin.longitude);
    const afterDistance = distanceMeters(after.latitude, after.longitude, coin.latitude, coin.longitude);
    const beforeInside = beforeDistance <= coin.radius_m;
    const afterInside = afterDistance <= coin.radius_m;

    if (beforeInside || !afterInside) continue;

    const distanceChange = afterDistance - beforeDistance;
    const fraction =
      distanceChange === 0 ? 0 : (coin.radius_m - beforeDistance) / distanceChange;
    return before.timestampMs + (after.timestampMs - before.timestampMs) * fraction;
  }
  return undefined;
};

export const detectFirstCoinPassages = (
  points: TrackPoint[],
  coins: Coin[]
): Array<{ coin: Coin; timestampMs: number }> =>
  coins
    .map((coin) => {
      const timestampMs = detectCoinPassage(points, coin);
      return timestampMs === undefined ? undefined : { coin, timestampMs };
    })
    .filter((passage): passage is { coin: Coin; timestampMs: number } => passage !== undefined)
    .sort((left, right) => left.timestampMs - right.timestampMs);
