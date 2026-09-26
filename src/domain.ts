export type CollectibleType = "coin" | "landmark";
export type CollectibleRarity = "common" | "rare" | "epic";

export interface Collectible {
  id: string;
  name: string;
  type: CollectibleType;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  value: number;
  rarity?: CollectibleRarity;
  description?: string;
}

export interface TrackPoint {
  latitude: number;
  longitude: number;
  timestampMs: number;
}

export interface VideoTimeSample {
  timestampMs: number;
  videoSeconds: number;
}

export interface GameEvent {
  /** @deprecated Compatibility alias for sourceId. */
  id: string;
  type: "collectible_collected";
  sourceId: string;
  collectible: {
    name: string;
    type: CollectibleType;
    rarity?: CollectibleRarity;
  };
  value: number;
  latitude: number;
  longitude: number;
  activityTimestamp: number;
  videoSecond?: number;
}

export interface NearMissCollectible {
  collectibleId: string;
  name: string;
  value: number;
  rarity?: CollectibleRarity;
  minimumDistanceMeters: number;
}

export interface MappedGameEvent extends GameEvent {
  videoSecond: number;
}

export interface Activity {
  id: string;
  source: "fit";
  startedAt: number;
  endedAt: number;
  route: TrackPoint[];
  distance?: number;
  duration?: number;
}

export interface ActivityResult {
  activityId: string;
  distance?: number;
  duration?: number;
  collectedCount: number;
  totalPoints: number;
  collectibles: Collectible[];
  events: GameEvent[];
  nearMisses: NearMissCollectible[];
}

export interface HudTrackSample {
  latitude: number;
  longitude: number;
  videoSecond: number;
}

export interface HudTimeline {
  version: 1;
  track: HudTrackSample[];
  collectibles: Collectible[];
  events: MappedGameEvent[];
}

export interface WorldQueryDiagnostics {
  totalCollectibles: number;
  relevantCollectibles: number;
}

export type JobState = "processing" | "awaiting_selection" | "rendering" | "succeeded" | "failed";

export interface Job {
  token: string;
  state: JobState;
  createdAt: string;
  updatedAt: string;
  error?: string;
  sourceDuration?: number;
  resultMode?: "activity" | "video";
  activity?: Activity;
  activityResult?: ActivityResult;
  mappedEvents?: MappedGameEvent[];
  outputFile?: string;
  render?: import("./video.js").RenderSummary;
  synchronization?: import("./synchronization.js").SynchronizationSummary;
  world?: WorldQueryDiagnostics;
}
