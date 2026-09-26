import type { TrackPoint, VideoTimeSample } from "./domain.js";

export type SynchronizationErrorCode =
  | "NO_GPMD_TRACK"
  | "UNSUPPORTED_VIDEO_METADATA"
  | "NO_VALID_VIDEO_CLOCK"
  | "INVALID_FIT_TIMESTAMPS"
  | "NO_OVERLAPPING_TIME_RANGE";

export type SynchronizationWarningCode = "FIT_SAMPLE_GAP" | "PARTIAL_TIME_RANGE";

export interface SynchronizationSummary {
  status: "ok" | "error";
  confidence?: "high" | "medium" | "low";
  errorCode?: SynchronizationErrorCode;
  warnings: string[];
  overlapSeconds?: number;
  availableEvents?: number;
  unavailableEvents?: number;
}

export interface SynchronizationAssessment {
  summary: SynchronizationSummary;
  videoStartMs: number;
  videoEndMs: number;
}

export class SynchronizationError extends Error {
  constructor(
    readonly code: SynchronizationErrorCode,
    message: string,
    readonly summary: SynchronizationSummary
  ) {
    super(message);
  }
}

const messageFor = (code: SynchronizationErrorCode): string => ({
  NO_GPMD_TRACK: "MP4 has no GPMF metadata track. Upload the original GoPro MP4, not an exported or trimmed copy.",
  UNSUPPORTED_VIDEO_METADATA: "MP4 has no usable GPS5 GPMF metadata. Upload an original GoPro GPS5 recording.",
  NO_VALID_VIDEO_CLOCK: "GPS5 metadata has no stable plausible UTC video clock.",
  INVALID_FIT_TIMESTAMPS: "FIT file has fewer than two usable timestamped GPS trackpoints.",
  NO_OVERLAPPING_TIME_RANGE: "The FIT activity and video do not overlap in time."
}[code]);

export const synchronizationFailure = (code: SynchronizationErrorCode): SynchronizationError => {
  const summary: SynchronizationSummary = { status: "error", errorCode: code, warnings: [] };
  return new SynchronizationError(code, messageFor(code), summary);
};

export const assessSynchronization = (
  track: TrackPoint[],
  samples: VideoTimeSample[],
  videoDurationSeconds: number,
  fitGapWarningSeconds: number
): SynchronizationAssessment => {
  if (track.length < 2 || track.some((point) => !Number.isFinite(point.timestampMs))) {
    throw synchronizationFailure("INVALID_FIT_TIMESTAMPS");
  }
  if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0 || !samples.length) {
    throw synchronizationFailure("NO_VALID_VIDEO_CLOCK");
  }
  const starts = samples
    .map((sample) => sample.timestampMs - sample.videoSeconds * 1000)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!starts.length) throw synchronizationFailure("NO_VALID_VIDEO_CLOCK");
  const videoStartMs = starts[Math.floor(starts.length / 2)];
  const videoEndMs = videoStartMs + videoDurationSeconds * 1000;
  const fitStartMs = track[0].timestampMs;
  const fitEndMs = track.at(-1)!.timestampMs;
  const overlapMs = Math.min(fitEndMs, videoEndMs) - Math.max(fitStartMs, videoStartMs);
  if (overlapMs < 0) throw synchronizationFailure("NO_OVERLAPPING_TIME_RANGE");

  const warnings: string[] = [];
  const videoExtendsBeyondFit = videoStartMs < fitStartMs || videoEndMs > fitEndMs;
  if (videoExtendsBeyondFit) {
    warnings.push("Video extends beyond the available FIT activity time range.");
  }
  if (track.some((point, index) => index > 0 && point.timestampMs - track[index - 1].timestampMs >= fitGapWarningSeconds * 1000)) {
    warnings.push(`FIT samples contain a gap of at least ${fitGapWarningSeconds} seconds.`);
  }
  return {
    videoStartMs,
    videoEndMs,
    summary: {
      status: "ok",
      confidence: videoExtendsBeyondFit ? "low" : warnings.length ? "medium" : "high",
      warnings,
      overlapSeconds: overlapMs / 1000,
      availableEvents: 0,
      unavailableEvents: 0
    }
  };
};

export const withEventAvailability = (
  assessment: SynchronizationAssessment,
  timestampsMs: number[]
): SynchronizationSummary => ({
  ...assessment.summary,
  availableEvents: timestampsMs.filter(
    (timestampMs) => timestampMs >= assessment.videoStartMs && timestampMs <= assessment.videoEndMs
  ).length,
  unavailableEvents: timestampsMs.filter(
    (timestampMs) => timestampMs < assessment.videoStartMs || timestampMs > assessment.videoEndMs
  ).length
});
