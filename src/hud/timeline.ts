import { readFile, writeFile } from "node:fs/promises";
import type { Coin, GameEvent, HudTimeline, TrackPoint, VideoTimeSample } from "../domain.js";
import { mapToVideoSecond } from "../gpmf.js";
import { UserInputError } from "../errors.js";

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isCoin = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === "string" &&
  isFiniteNumber(value.latitude) &&
  isFiniteNumber(value.longitude) &&
  isFiniteNumber(value.radius_m) &&
  isFiniteNumber(value.value);

const isEvent = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === "string" &&
  value.type === "coin" &&
  isFiniteNumber(value.value) &&
  isFiniteNumber(value.latitude) &&
  isFiniteNumber(value.longitude) &&
  isFiniteNumber(value.activityTimestamp) &&
  isFiniteNumber(value.videoSecond);

export const createHudTimeline = (
  track: TrackPoint[],
  coins: Coin[],
  events: GameEvent[],
  samples: VideoTimeSample[],
  duration: number
): HudTimeline => ({
  version: 1,
  track: track
    .map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      videoSecond: mapToVideoSecond(point.timestampMs, samples)
    }))
    .filter((point) => point.videoSecond >= 0 && point.videoSecond <= duration)
    .sort((left, right) => left.videoSecond - right.videoSecond),
  coins,
  events: [...events].sort((left, right) => left.videoSecond - right.videoSecond)
});

const isTimeline = (value: unknown): value is HudTimeline => {
  if (typeof value !== "object" || value === null) return false;
  const timeline = value as Partial<HudTimeline>;
  return (
    timeline.version === 1 &&
    Array.isArray(timeline.track) &&
    timeline.track.length >= 2 &&
    timeline.track.every((point) => isFiniteNumber(point.latitude) && isFiniteNumber(point.longitude) && isFiniteNumber(point.videoSecond)) &&
    Array.isArray(timeline.coins) &&
    timeline.coins.every(isCoin) &&
    Array.isArray(timeline.events) &&
    timeline.events.every(isEvent)
  );
};

export const saveHudTimeline = async (file: string, timeline: HudTimeline): Promise<void> => {
  await writeFile(file, JSON.stringify(timeline));
};

export const loadHudTimeline = async (file: string): Promise<HudTimeline> => {
  try {
    const timeline: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isTimeline(timeline)) throw new Error("invalid format");
    return timeline;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UserInputError(`HUD timeline could not be loaded: ${message}`);
  }
};
