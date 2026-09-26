import { readFile } from "node:fs/promises";
import FitParser from "fit-file-parser";
import type { TrackPoint } from "./domain.js";
import { UserInputError } from "./errors.js";
import { synchronizationFailure } from "./synchronization.js";

interface FitRecord {
  position_lat?: number;
  position_long?: number;
  timestamp?: Date | string | number;
}

interface FitData {
  records?: FitRecord[];
}

export const usableFitTrackPoints = (records: FitRecord[]): TrackPoint[] => {
  const points = records
    .map((record): TrackPoint | undefined => {
      if (
        typeof record.position_lat !== "number" ||
        typeof record.position_long !== "number" ||
        record.timestamp === undefined
      ) {
        return undefined;
      }
      const timestampMs = new Date(record.timestamp).getTime();
      if (!Number.isFinite(timestampMs)) return undefined;
      return {
        latitude: record.position_lat,
        longitude: record.position_long,
        timestampMs
      };
    })
    .filter((point): point is TrackPoint => point !== undefined)
    .sort((left, right) => left.timestampMs - right.timestampMs);

  if (points.length < 2) throw synchronizationFailure("INVALID_FIT_TIMESTAMPS");
  return points;
};

export const parseFitTrack = async (file: string): Promise<TrackPoint[]> => {
  const source = await readFile(file);
  const parser = new FitParser({ force: true, speedUnit: "m/s", lengthUnit: "m" });
  let data: FitData;
  try {
    data = await parser.parseAsync(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UserInputError(`FIT parsing failed: ${message}`);
  }

  return usableFitTrackPoints(data.records ?? []);
};
