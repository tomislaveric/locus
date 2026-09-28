import type { Activity, ActivityResult, ActivityType, Collectible, GameEvent, NearMissCollectible, TrackPoint } from "./domain.js";
import { distanceMeters, detectFirstCollectiblePassages, minimumRouteDistanceMeters } from "./geometry.js";

export const NEAR_MISS_THRESHOLD_METERS = 100;
export const MAX_NEAR_MISSES = 5;

export const deriveActivity = (id: string, route: TrackPoint[], type: ActivityType = "unknown"): Activity => {
  const distance = route.slice(1).reduce(
    (total, point, index) =>
      total + distanceMeters(route[index].latitude, route[index].longitude, point.latitude, point.longitude),
    0
  );
  const startedAt = route[0].timestampMs;
  const endedAt = route.at(-1)!.timestampMs;
  return {
    id,
    source: "fit",
    type,
    startedAt,
    endedAt,
    route,
    distance,
    duration: Math.max(0, (endedAt - startedAt) / 1000)
  };
};

export const deriveNearMisses = (
  activity: Activity,
  collectibles: Collectible[],
  events: GameEvent[]
): NearMissCollectible[] => {
  const collectedIds = new Set(events.map((event) => event.sourceId));
  return collectibles
    .filter((collectible) => !collectedIds.has(collectible.id))
    .map((collectible) => ({
      collectibleId: collectible.id,
      name: collectible.name,
      value: collectible.value,
      ...(collectible.rarity === undefined ? {} : { rarity: collectible.rarity }),
      minimumDistanceMeters: minimumRouteDistanceMeters(activity.route, collectible)
    }))
    .filter((collectible) => collectible.minimumDistanceMeters <= NEAR_MISS_THRESHOLD_METERS)
    .sort((left, right) => left.minimumDistanceMeters - right.minimumDistanceMeters)
    .slice(0, MAX_NEAR_MISSES);
};

export const deriveActivityResult = (activity: Activity, collectibles: Collectible[]): ActivityResult => {
  const passages = detectFirstCollectiblePassages(activity.route, collectibles);
  const events: GameEvent[] = passages.map((passage) => ({
    id: passage.collectible.id,
    sourceId: passage.collectible.id,
    type: "collectible_collected",
    collectible: {
      name: passage.collectible.name,
      type: passage.collectible.type,
      ...(passage.collectible.rarity === undefined ? {} : { rarity: passage.collectible.rarity })
    },
    value: passage.collectible.value,
    latitude: passage.collectible.latitude,
    longitude: passage.collectible.longitude,
    activityTimestamp: passage.timestampMs
  }));
  return {
    activityId: activity.id,
    distance: activity.distance,
    duration: activity.duration,
    collectedCount: events.length,
    totalPoints: events.reduce((total, event) => total + event.value, 0),
    collectibles,
    events,
    nearMisses: deriveNearMisses(activity, collectibles, events)
  };
};
