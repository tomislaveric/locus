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
  videoSecond: number;
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
  events: GameEvent[];
}

export type JobState = "processing" | "awaiting_selection" | "rendering" | "succeeded" | "failed";

export interface Job {
  token: string;
  state: JobState;
  createdAt: string;
  updatedAt: string;
  error?: string;
  sourceDuration?: number;
  events?: GameEvent[];
  outputFile?: string;
  render?: import("./video.js").RenderSummary;
  synchronization?: import("./synchronization.js").SynchronizationSummary;
}
