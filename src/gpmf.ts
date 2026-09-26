import { readFile } from "node:fs/promises";
import { GoProTelemetry } from "gopro-telemetry";
import { runCommand } from "./commands.js";
import type { VideoTimeSample } from "./domain.js";
import { UserInputError } from "./errors.js";

interface GpsSample {
  date?: unknown;
  cts?: unknown;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

const locateGps5Samples = (value: unknown): GpsSample[] | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;
  const streams = asRecord(record.streams);
  const gps5 = streams && asRecord(streams.GPS5);
  if (gps5 && Array.isArray(gps5.samples)) return gps5.samples as GpsSample[];
  for (const child of Object.values(record)) {
    const samples = locateGps5Samples(child);
    if (samples) return samples;
  }
  return undefined;
};

const dateToMilliseconds = (value: unknown): number | undefined => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : undefined;
  }
  return undefined;
};

interface ProbePacket {
  pts_time?: string;
  duration_time?: string;
}

interface ProbeData {
  packets?: ProbePacket[];
}

const readGpmfInput = async (
  file: string,
  metadataFile: string,
  streamIndex: number,
  timeoutMs: number
): Promise<{ rawData: Buffer; timing: { videoDuration: number; frameDuration: number; start: Date; samples: Array<{ cts: number; duration: number }> } }> => {
  const output = await runCommand(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      String(streamIndex),
      "-show_packets",
      "-show_entries",
      "packet=pts_time,duration_time",
      "-of",
      "json",
      file
    ],
    timeoutMs
  );
  let probe: ProbeData;
  try {
    probe = JSON.parse(output) as ProbeData;
  } catch {
    throw new UserInputError("FFprobe returned invalid GPMF packet timing.");
  }
  const samples = (probe.packets ?? [])
    .map((packet) => {
      const cts = Number(packet.pts_time) * 1000;
      const duration = Number(packet.duration_time) * 1000;
      return { cts, duration };
    })
    .filter(({ cts, duration }) => Number.isFinite(cts) && Number.isFinite(duration) && duration > 0);
  if (!samples.length) {
    throw new UserInputError("MP4 has no readable GPMF packet timing.");
  }
  await runCommand(
    "ffmpeg",
    ["-y", "-i", file, "-map", `0:${streamIndex}`, "-c", "copy", "-f", "data", metadataFile],
    timeoutMs
  );
  const rawData = await readFile(metadataFile);
  if (!rawData.length) throw new UserInputError("MP4 has an empty GPMF metadata track.");
  const last = samples.at(-1);
  return {
    rawData,
    timing: {
      videoDuration: (last!.cts + last!.duration) / 1000,
      frameDuration: samples[0].duration / 1000,
      start: new Date(0),
      samples
    }
  };
};

export const extractGps5Times = async (
  file: string,
  metadataFile: string,
  streamIndex: number,
  timeoutMs: number
): Promise<VideoTimeSample[]> => {
  let output: unknown;
  try {
    const extracted = await readGpmfInput(file, metadataFile, streamIndex, timeoutMs);
    output = await GoProTelemetry(
      extracted,
      { stream: ["GPS5"], dateStream: true, repeatSticky: true, removeGaps: false }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UserInputError(`Could not extract required GPS5 GPMF telemetry: ${message}`);
  }

  const samples = locateGps5Samples(output);
  if (!samples?.length) {
    throw new UserInputError("MP4 has no supported GPS5 GPMF stream.");
  }
  const candidates = samples
    .map((sample) => {
      const timestampMs = dateToMilliseconds(sample.date);
      if (timestampMs === undefined || typeof sample.cts !== "number") return undefined;
      const year = new Date(timestampMs).getUTCFullYear();
      if (year < 2020 || year > 2100) return undefined;
      return { ctsMs: sample.cts, videoStartMs: timestampMs - sample.cts };
    })
    .filter(
      (sample): sample is { ctsMs: number; videoStartMs: number } => sample !== undefined
    );
  if (candidates.length < 20) {
    throw new UserInputError("GPS5 stream has insufficient plausible UTC timestamps for synchronization.");
  }

  const counts = new Map<number, number>();
  for (const candidate of candidates) {
    const second = Math.round(candidate.videoStartMs / 1000);
    counts.set(second, (counts.get(second) ?? 0) + 1);
  }
  const mode = [...counts.entries()].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  const clustered = candidates
    .filter((candidate) => Math.abs(candidate.videoStartMs / 1000 - mode[0]) <= 2)
    .sort((left, right) => left.videoStartMs - right.videoStartMs);
  if (clustered.length < 20) {
    throw new UserInputError("GPS5 timestamps do not contain a stable video-start clock.");
  }
  const videoStartMs = clustered[Math.floor(clustered.length / 2)].videoStartMs;
  const times = clustered
    .map(
      (sample): VideoTimeSample => ({
        timestampMs: videoStartMs + sample.ctsMs,
        videoSeconds: sample.ctsMs / 1000
      })
    )
    .sort((left, right) => left.timestampMs - right.timestampMs);
  return times;
};

export const mapToVideoSecond = (
  eventTimestampMs: number,
  times: VideoTimeSample[]
): number => {
  return (eventTimestampMs - videoStartMilliseconds(times)) / 1000;
};

export const videoStartMilliseconds = (times: VideoTimeSample[]): number => {
  if (!times.length) throw new UserInputError("GPS5 stream has no synchronized timestamps.");
  const starts = times
    .map((sample) => sample.timestampMs - sample.videoSeconds * 1000)
    .sort((left, right) => left - right);
  return starts[Math.floor(starts.length / 2)];
};
