import type { Activity, ActivityResult, Coin, GameEvent, TrackPoint } from "./domain.js";
import { distanceMeters, detectFirstCoinPassages } from "./geometry.js";

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

export const deriveActivityResult = (activity: Activity, coins: Coin[]): ActivityResult => {
  const events: GameEvent[] = detectFirstCoinPassages(activity.route, coins).map((passage) => ({
    id: passage.coin.id,
    type: "coin",
    value: passage.coin.value,
    latitude: passage.coin.latitude,
    longitude: passage.coin.longitude,
    activityTimestamp: passage.timestampMs
  }));
  return {
    activityId: activity.id,
    distance: activity.distance,
    duration: activity.duration,
    collectedCount: events.length,
    totalPoints: events.reduce((total, event) => total + event.value, 0),
    collectibles: coins,
    events
  };
};
