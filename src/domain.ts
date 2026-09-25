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

export type JobState = "processing" | "succeeded" | "failed";

export interface Job {
  token: string;
  state: JobState;
  createdAt: string;
  updatedAt: string;
  error?: string;
  detectedVideoSecond?: number;
  outputFile?: string;
}
