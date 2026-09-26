export interface Coin {
  id: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  value: number;
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
  id: string;
  type: "coin";
  value: number;
  latitude: number;
  longitude: number;
  activityTimestamp: number;
  videoSecond?: number;
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
  collectibles: Coin[];
  events: GameEvent[];
}

export interface HudTrackSample {
  latitude: number;
  longitude: number;
  videoSecond: number;
}

export interface HudTimeline {
  version: 1;
  track: HudTrackSample[];
  coins: Coin[];
  events: MappedGameEvent[];
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
}
