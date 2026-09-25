import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./commands.js";
import type { DetectedCoinPassage } from "./domain.js";
import { UserInputError } from "./errors.js";
import { createOverlay } from "./overlay.js";

interface ProbeFormat {
  duration?: string;
}

interface ProbeResult {
  format?: ProbeFormat;
  streams?: Array<{ index?: number; codec_type?: string; codec_tag_string?: string }>;
}

export interface ClipInterval {
  start: number;
  end: number;
  passages: DetectedCoinPassage[];
}

export const probeDuration = async (file: string, timeoutMs: number): Promise<number> => {
  const metadata = await inspectMedia(file, timeoutMs);
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || duration < 4) {
    throw new UserInputError("Video must be at least four seconds long.");
  }
  return duration;
};

export const gpmfStreamIndex = async (file: string, timeoutMs: number): Promise<number> => {
  const metadata = await inspectMedia(file, timeoutMs);
  const stream = metadata.streams?.find(
    (candidate) => candidate.codec_type === "data" && candidate.codec_tag_string === "gpmd"
  );
  if (stream?.index === undefined) {
    throw new UserInputError(
      "MP4 has no GPMF metadata track. Upload the original GoPro MP4, not an exported or trimmed copy."
    );
  }
  return stream.index;
};

export const buildClipIntervals = (
  passages: DetectedCoinPassage[],
  duration: number
): ClipInterval[] => {
  const clipDuration = Math.min(6, duration);
  const windows = [...passages]
    .sort((left, right) => left.videoSecond - right.videoSecond)
    .map((passage) => {
      const start = Math.max(0, Math.min(passage.videoSecond - 3, duration - clipDuration));
      return { start, end: start + clipDuration, passages: [passage] };
    });

  return windows.reduce<ClipInterval[]>((intervals, window) => {
    const previous = intervals.at(-1);
    if (previous && window.start <= previous.end) {
      previous.end = Math.max(previous.end, window.end);
      previous.passages.push(...window.passages);
    } else {
      intervals.push(window);
    }
    return intervals;
  }, []);
};

const inspectMedia = async (file: string, timeoutMs: number): Promise<ProbeResult> => {
  const output = await runCommand(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
    timeoutMs
  );
  try {
    return JSON.parse(output) as ProbeResult;
  } catch {
    throw new UserInputError("FFprobe returned invalid metadata.");
  }
};

const hasAudio = async (file: string, timeoutMs: number): Promise<boolean> => {
  const metadata = await inspectMedia(file, timeoutMs);
  return metadata.streams?.some((stream) => stream.codec_type === "audio") ?? false;
};

const concatListEntry = (file: string): string => `file '${file.replaceAll("'", "'\\''")}'`;

export const renderSelectedClips = async (
  input: string,
  output: string,
  passages: DetectedCoinPassage[],
  duration: number,
  workDirectory: string,
  timeoutMs: number
): Promise<void> => {
  const intervals = buildClipIntervals(passages, duration);
  if (intervals.length === 0) throw new UserInputError("Select at least one detected coin.");
  const audioPresent = await hasAudio(input, timeoutMs);
  const segmentFiles: string[] = [];

  for (const [intervalIndex, interval] of intervals.entries()) {
    const overlayFiles = await Promise.all(
      interval.passages.map(async (passage, overlayIndex) => {
        const file = path.join(workDirectory, `overlay-${intervalIndex}-${overlayIndex}.png`);
        await createOverlay(file, passage.value);
        return file;
      })
    );
    const segmentFile = path.join(workDirectory, `segment-${intervalIndex}.mp4`);
    const inputArgs = ["-ss", interval.start.toFixed(3), "-i", input];
    for (const overlayFile of overlayFiles) inputArgs.push("-loop", "1", "-i", overlayFile);

    let videoLabel = "[0:v]";
    const filters: string[] = [];
    for (const [overlayIndex, passage] of interval.passages.entries()) {
      const nextLabel = `[v${overlayIndex}]`;
      const eventSecond = Math.max(0, passage.videoSecond - interval.start);
      const overlayEnd = Math.min(interval.end - interval.start, eventSecond + 2);
      filters.push(
        `${videoLabel}[${overlayIndex + 1}:v]overlay=(W-w)/2:(H-h)/2:format=auto:enable='between(t,${eventSecond.toFixed(3)},${overlayEnd.toFixed(3)})'${nextLabel}`
      );
      videoLabel = nextLabel;
    }

    const outputArgs = [
      "-t",
      (interval.end - interval.start).toFixed(3),
      "-filter_complex",
      filters.join(";"),
      "-map",
      videoLabel
    ];
    if (audioPresent) outputArgs.push("-map", "0:a?");
    outputArgs.push(
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      segmentFile
    );
    await runCommand("ffmpeg", ["-y", ...inputArgs, ...outputArgs], timeoutMs);
    segmentFiles.push(segmentFile);
  }

  const listFile = path.join(workDirectory, "segments.txt");
  await writeFile(listFile, `${segmentFiles.map(concatListEntry).join("\n")}\n`);
  await runCommand(
    "ffmpeg",
    ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", output],
    timeoutMs
  );
  await probeDuration(output, timeoutMs);
};
