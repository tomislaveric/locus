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

export interface PlayerProgress {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressToNextLevel: number;
}

export interface ProgressionResult {
  previousTotalXp: number;
  xpEarned: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
}

export interface ActivityHistoryItem {
  id: string;
  startedAt: string;
  distanceMeters?: number;
  durationSeconds?: number;
  xpEarned: number;
  collectedCount: number;
  hasVideo: boolean;
}

export interface PersistedActivity extends ActivityHistoryItem {
  events: PersistedActivityEvent[];
  replay?: ReplaySnapshot;
  video?: ActivityVideo;
}

export type ActivityVideoState = "syncing" | "sync_failed" | "awaiting_selection" | "rendering" | "succeeded" | "render_failed";

export interface ActivityVideo {
  mediaId: string;
  sourceFilename: string;
  state: ActivityVideoState;
  sourceDuration?: number;
  synchronization?: import("./synchronization.js").SynchronizationSummary;
  events?: MappedGameEvent[];
  selectedSourceIds?: string[];
  render?: import("./video.js").RenderSummary;
  error?: string;
  previewUrl?: string;
  downloadUrl?: string;
}

export interface PersistedActivityEvent {
  id: string;
  sourceId: string;
  type: GameEvent["type"];
  collectible: GameEvent["collectible"];
  value: number;
  latitude: number;
  longitude: number;
  activityTimestamp: number;
}

export interface ReplaySnapshot {
  version: 1;
  activity: Activity;
  activityResult: ActivityResult;
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
