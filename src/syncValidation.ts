import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Coin, TrackPoint, VideoTimeSample } from "./domain.js";
import { parseFitTrack } from "./fit.js";
import { detectCoinPassage } from "./geometry.js";
import { extractGps5Times, mapToVideoSecond, videoStartMilliseconds } from "./gpmf.js";
import { gpmfStreamIndex, probeDuration } from "./video.js";
import { assessSynchronization, withEventAvailability, type SynchronizationSummary } from "./synchronization.js";
import { config } from "./config.js";

export interface SyncReferenceEvent {
  coinId: string;
  expectedVideoSecond: number;
  toleranceSeconds?: number;
}

export interface SyncFixture {
  name: string;
  fit: string;
  video: string;
  coins: Coin[];
  events: SyncReferenceEvent[];
  expectedVideoStartUtc?: string;
}

export interface SyncEventResult {
  sourceId: string;
  coinId: string;
  expectedVideoSecond: number;
  actualVideoSecond?: number;
  absoluteErrorSeconds?: number;
  toleranceSeconds: number;
  passed: boolean;
  videoStartUtc?: string;
  fitEventUtc?: string;
  diagnostic?: string;
}

export interface SyncFixtureResult {
  fixture: SyncFixture;
  durationSeconds: number;
  videoStartMs: number;
  events: SyncEventResult[];
  synchronization: SynchronizationSummary;
}

const videoStartToleranceSeconds = 1.5;

export interface SyncValidationDependencies {
  parseFitTrack: (file: string) => Promise<TrackPoint[]>;
  detectCoinPassage: (points: TrackPoint[], coin: Coin) => number | undefined;
  gpmfStreamIndex: (file: string, timeoutMs: number) => Promise<number>;
  extractGps5Times: (
    file: string,
    metadataFile: string,
    streamIndex: number,
    timeoutMs: number
  ) => Promise<VideoTimeSample[]>;
  probeDuration: (file: string, timeoutMs: number) => Promise<number>;
  mapToVideoSecond: (eventTimestampMs: number, times: VideoTimeSample[]) => number;
  videoStartMilliseconds: (times: VideoTimeSample[]) => number;
}

const defaults: SyncValidationDependencies = {
  parseFitTrack,
  detectCoinPassage,
  gpmfStreamIndex,
  extractGps5Times,
  probeDuration,
  mapToVideoSecond,
  videoStartMilliseconds
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const parseCoin = (value: unknown, fixturePath: string): Coin => {
  if (!isRecord(value) ||
    typeof value.id !== "string" ||
    !["latitude", "longitude", "radius_m", "value"].every((key) => isFiniteNumber(value[key]))) {
    throw new Error(`${fixturePath}: every coin must contain finite id, latitude, longitude, radius_m, and value fields.`);
  }
  const latitude = value.latitude as number;
  const longitude = value.longitude as number;
  const radius = value.radius_m as number;
  const coinValue = value.value as number;
  if (!value.id || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || radius < 5) {
    throw new Error(`${fixturePath}: every coin needs a nonempty ID, valid coordinates, and radius_m of at least 5.`);
  }
  return {
    id: value.id as string,
    latitude,
    longitude,
    radius_m: radius,
    value: coinValue
  };
};

const parseFixture = (value: unknown, fixturePath: string): SyncFixture => {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.fit !== "string" || typeof value.video !== "string") {
    throw new Error(`${fixturePath}: fixture must contain string name, fit, and video fields.`);
  }
  if (!value.name || path.isAbsolute(value.fit) || path.isAbsolute(value.video) ||
    value.fit.split(/[\\/]/).includes("..") || value.video.split(/[\\/]/).includes("..")) {
    throw new Error(`${fixturePath}: name must be nonempty and media paths must remain relative to the fixture root.`);
  }
  if (!Array.isArray(value.coins) || value.coins.length === 0) {
    throw new Error(`${fixturePath}: fixture must contain at least one coin.`);
  }
  if (!Array.isArray(value.events) || value.events.length === 0) {
    throw new Error(`${fixturePath}: fixture must contain at least one reference event.`);
  }
  const coins = value.coins.map((coin) => parseCoin(coin, fixturePath));
  const ids = new Set(coins.map((coin) => coin.id));
  if (ids.size !== coins.length) throw new Error(`${fixturePath}: coin IDs must be unique.`);
  const events = value.events.map((event): SyncReferenceEvent => {
    if (!isRecord(event) || typeof event.coinId !== "string" || !isFiniteNumber(event.expectedVideoSecond) ||
      (event.toleranceSeconds !== undefined && (!isFiniteNumber(event.toleranceSeconds) || event.toleranceSeconds <= 0))) {
      throw new Error(`${fixturePath}: every event needs coinId, expectedVideoSecond, and an optional positive toleranceSeconds.`);
    }
    if (!ids.has(event.coinId)) throw new Error(`${fixturePath}: event ${event.coinId} has no matching fixture coin.`);
    return {
      coinId: event.coinId,
      expectedVideoSecond: event.expectedVideoSecond,
      toleranceSeconds: event.toleranceSeconds
    };
  });
  if (value.expectedVideoStartUtc !== undefined &&
    (typeof value.expectedVideoStartUtc !== "string" || !Number.isFinite(new Date(value.expectedVideoStartUtc).getTime()))) {
    throw new Error(`${fixturePath}: expectedVideoStartUtc must be an ISO timestamp.`);
  }
  return {
    name: value.name,
    fit: value.fit,
    video: value.video,
    coins,
    events,
    expectedVideoStartUtc: value.expectedVideoStartUtc as string | undefined
  };
};

export const loadSyncFixture = async (fixturePath: string): Promise<SyncFixture> => {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${fixturePath}: could not load fixture: ${message}`);
  }
  return parseFixture(value, fixturePath);
};

export const discoverSyncFixtures = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();

export const mediaAvailable = async (file: string): Promise<boolean> => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};

export const fixtureFailureResults = (
  fixture: SyncFixture,
  error: unknown
): SyncEventResult[] => {
  const message = error instanceof Error ? error.message : String(error);
  return fixture.events.map((reference) => ({
    sourceId: fixture.name,
    coinId: reference.coinId,
    expectedVideoSecond: reference.expectedVideoSecond,
    toleranceSeconds: reference.toleranceSeconds ?? 1.5,
    passed: false,
    diagnostic: `Fixture validation failed: ${message}`
  }));
};

export const validateSyncFixture = async (
  fixture: SyncFixture,
  mediaDirectory: string,
  timeoutMs: number,
  dependencies: SyncValidationDependencies = defaults
): Promise<SyncFixtureResult> => {
  const fit = path.resolve(mediaDirectory, fixture.fit);
  const video = path.resolve(mediaDirectory, fixture.video);
  const metadataDirectory = await mkdtemp(path.join(tmpdir(), "post-ride-ar-sync-"));
  try {
    const [track, durationSeconds, streamIndex] = await Promise.all([
      dependencies.parseFitTrack(fit),
      dependencies.probeDuration(video, timeoutMs),
      dependencies.gpmfStreamIndex(video, timeoutMs)
    ]);
    const samples = await dependencies.extractGps5Times(
      video,
      path.join(metadataDirectory, "metadata.gpmf"),
      streamIndex,
      timeoutMs
    );
    const assessment = assessSynchronization(
      track,
      samples,
      durationSeconds,
      config.fitSampleGapWarningSeconds
    );
    const videoStartMs = assessment.videoStartMs;
    const videoStartUtc = new Date(videoStartMs).toISOString();
    const expectedVideoStartMs = fixture.expectedVideoStartUtc === undefined
      ? undefined
      : new Date(fixture.expectedVideoStartUtc).getTime();
    const videoStartErrorSeconds = expectedVideoStartMs === undefined
      ? undefined
      : Math.abs(videoStartMs - expectedVideoStartMs) / 1000;
    const videoStartDiagnostic = videoStartErrorSeconds !== undefined &&
      videoStartErrorSeconds > videoStartToleranceSeconds
      ? `Video start differs from expected ${fixture.expectedVideoStartUtc} by ${videoStartErrorSeconds.toFixed(3)} seconds.`
      : undefined;
    const detectedTimestamps: number[] = [];
    const events = fixture.events.map((reference) => {
      const coin = fixture.coins.find((candidate) => candidate.id === reference.coinId)!;
      const timestampMs = dependencies.detectCoinPassage(track, coin);
      const toleranceSeconds = reference.toleranceSeconds ?? 1.5;
      if (timestampMs === undefined) {
        return {
          sourceId: fixture.name,
          coinId: reference.coinId,
          expectedVideoSecond: reference.expectedVideoSecond,
          toleranceSeconds,
          passed: false,
          videoStartUtc,
          diagnostic: [videoStartDiagnostic, "No outside-to-inside FIT crossing was detected."].filter(Boolean).join(" ")
        };
      }
      detectedTimestamps.push(timestampMs);
      const actualVideoSecond = dependencies.mapToVideoSecond(timestampMs, samples);
      const absoluteErrorSeconds = Math.abs(actualVideoSecond - reference.expectedVideoSecond);
      const inVideo = actualVideoSecond >= 0 && actualVideoSecond <= durationSeconds;
      return {
        sourceId: fixture.name,
        coinId: reference.coinId,
        expectedVideoSecond: reference.expectedVideoSecond,
        actualVideoSecond,
        absoluteErrorSeconds,
        toleranceSeconds,
        passed: videoStartDiagnostic === undefined && inVideo && absoluteErrorSeconds <= toleranceSeconds,
        videoStartUtc,
        fitEventUtc: new Date(timestampMs).toISOString(),
        diagnostic: [
          videoStartDiagnostic,
          inVideo ? undefined : "EVENT_OUTSIDE_VIDEO: mapped event is outside the video time range."
        ].filter(Boolean).join(" ") || undefined
      };
    });
    return {
      fixture,
      durationSeconds,
      videoStartMs,
      events,
      synchronization: withEventAvailability(assessment, detectedTimestamps)
    };
  } finally {
    await rm(metadataDirectory, { recursive: true, force: true });
  }
};
