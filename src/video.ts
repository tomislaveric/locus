import { runCommand } from "./commands.js";
import { UserInputError } from "./errors.js";
import { createOverlay } from "./overlay.js";

interface ProbeFormat {
  duration?: string;
}

interface ProbeResult {
  format?: ProbeFormat;
  streams?: Array<{ index?: number; codec_type?: string; codec_tag_string?: string }>;
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

export const renderClip = async (
  input: string,
  output: string,
  eventSecond: number,
  duration: number,
  coinValue: number,
  overlayFile: string,
  timeoutMs: number
): Promise<void> => {
  const clipDuration = Math.min(6, duration);
  const start = Math.max(0, Math.min(eventSecond - 3, duration - clipDuration));
  await createOverlay(overlayFile, coinValue);
  await runCommand(
    "ffmpeg",
    [
      "-y",
      "-ss",
      start.toFixed(3),
      "-i",
      input,
      "-loop",
      "1",
      "-i",
      overlayFile,
      "-t",
      clipDuration.toFixed(3),
      "-filter_complex",
      "[0:v][1:v]overlay=(W-w)/2:(H-h)/2:format=auto[v]",
      "-map",
      "[v]",
      "-map",
      "0:a?",
      "-shortest",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      output
    ],
    timeoutMs
  );
  await probeDuration(output, timeoutMs);
};
