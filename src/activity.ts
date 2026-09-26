import type { Activity, ActivityResult, Collectible, GameEvent, TrackPoint } from "./domain.js";
import { distanceMeters, detectFirstCollectiblePassages } from "./geometry.js";

export const deriveActivity = (id: string, route: TrackPoint[]): Activity => {
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
    startedAt,
    endedAt,
    route,
    distance,
    duration: Math.max(0, (endedAt - startedAt) / 1000)
  };
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
    events
  };
};
