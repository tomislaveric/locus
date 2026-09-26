import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createCoinEffectAssets,
  COIN_APPROACH_SECONDS,
  COIN_COLLECT_SECONDS,
  COIN_FINAL_EXPAND_SECONDS,
  COIN_REWARD_SECONDS
} from "./coin-effect.js";
import { runCommand } from "./commands.js";
import { config } from "./config.js";
import type { HudTimeline, MappedGameEvent } from "./domain.js";
import { UserInputError } from "./errors.js";
import { synchronizationFailure } from "./synchronization.js";
import { planHighlights } from "./highlightPlanner.js";
import { renderHudFrames } from "./hud/hudRenderer.js";

interface ProbeFormat {
  duration?: string;
  start_time?: string;
}

export interface ProbeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  start_time?: string;
}

export interface ProbeResult {
  format?: ProbeFormat;
  streams?: ProbeStream[];
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  videoCodec: string;
  pixelFormat?: string;
  frameRate?: number;
  audio?: {
    codec?: string;
    sampleRate?: number;
    channels?: number;
  };
}

export interface RenderValidationResult {
  valid: boolean;
  expectedDuration: number;
  actualDuration?: number;
  durationError?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  warnings: string[];
  errors: string[];
}

export interface RenderSummary {
  status: "succeeded";
  segmentCount: number;
  expectedDuration: number;
  actualDuration: number;
  audioPresent: boolean;
  warnings: string[];
  elapsedMs: number;
  speedRatio?: number;
}

export interface ClipInterval {
  start: number;
  end: number;
  events: MappedGameEvent[];
}

export const HIGHLIGHT_PRE_ROLL_SECONDS = 3;
export const HIGHLIGHT_POST_ROLL_SECONDS = 3;

export const probeDuration = async (file: string, timeoutMs: number): Promise<number> => {
  const media = await inspectMediaInfo(file, timeoutMs);
  if (media.duration < 4) throw new UserInputError("Video must be at least four seconds long.");
  return media.duration;
};

export const gpmfStreamIndex = async (file: string, timeoutMs: number): Promise<number> => {
  const metadata = await inspectMedia(file, timeoutMs);
  const stream = metadata.streams?.find((candidate) => candidate.codec_type === "data" && candidate.codec_tag_string === "gpmd");
  if (stream?.index === undefined) {
    throw synchronizationFailure("NO_GPMD_TRACK");
  }
  return stream.index;
};

export const probeVideoSize = async (file: string, timeoutMs: number): Promise<{ width: number; height: number }> => {
  const metadata = await inspectMedia(file, timeoutMs);
  const stream = metadata.streams?.find((candidate) => candidate.codec_type === "video");
  const width = stream?.width;
  const height = stream?.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new UserInputError("Video has no readable dimensions.");
  }
  return { width, height };
};

export const buildClipIntervals = (events: MappedGameEvent[], duration: number): ClipInterval[] => {
  const eventsById = new Map<string, MappedGameEvent>();
  for (const event of [...events].sort((left, right) => {
    if (left.videoSecond !== right.videoSecond) return left.videoSecond - right.videoSecond;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  })) {
    if (!eventsById.has(event.id)) eventsById.set(event.id, event);
  }
  return planHighlights(events, {
    preRollSeconds: HIGHLIGHT_PRE_ROLL_SECONDS,
    postRollSeconds: HIGHLIGHT_POST_ROLL_SECONDS,
    videoDurationSeconds: duration
  }).segments.map((segment) => ({
    start: segment.startSecond,
    end: segment.endSecond,
    events: segment.eventIds.map((id) => eventsById.get(id)!)
  }));
};

export const inspectMedia = async (file: string, timeoutMs: number): Promise<ProbeResult> => {
  const output = await runCommand("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], timeoutMs);
  try {
    return JSON.parse(output) as ProbeResult;
  } catch {
    throw new UserInputError("FFprobe returned invalid metadata.");
  }
};

const positiveNumber = (value: string | undefined): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const frameRate = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  const rate = denominator > 0 ? numerator / denominator : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
};

export const normalizeMediaInfo = (metadata: ProbeResult): MediaInfo => {
  const duration = positiveNumber(metadata.format?.duration);
  const video = metadata.streams?.find((stream) => stream.codec_type === "video");
  const width = video?.width;
  const height = video?.height;
  if (!duration || !video || typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new UserInputError("Unsupported media: a readable video stream with duration and dimensions is required.");
  }
  if (!video.codec_name || !["h264", "hevc"].includes(video.codec_name)) {
    throw new UserInputError("Unsupported media: only decodable H.264 or HEVC GoPro video is supported.");
  }
  const audio = metadata.streams?.find((stream) => stream.codec_type === "audio");
  return {
    duration,
    width,
    height,
    videoCodec: video.codec_name,
    pixelFormat: video.pix_fmt,
    frameRate: frameRate(video.r_frame_rate),
    audio: audio
      ? { codec: audio.codec_name, sampleRate: positiveNumber(audio.sample_rate), channels: audio.channels }
      : undefined
  };
};

export const inspectMediaInfo = async (file: string, timeoutMs: number): Promise<MediaInfo> =>
  normalizeMediaInfo(await inspectMedia(file, timeoutMs));

export const validateClipIntervals = (intervals: readonly ClipInterval[], sourceDuration: number): void => {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    throw new UserInputError("Invalid render plan: source duration must be positive.");
  }
  if (intervals.length === 0) throw new UserInputError("Invalid render plan: select at least one detected coin.");
  const tolerance = 0.001;
  let previousEnd = -Infinity;
  for (const [index, interval] of intervals.entries()) {
    if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.start < 0 || interval.end <= interval.start) {
      throw new UserInputError(`Invalid render plan: segment ${index + 1} has invalid timestamps.`);
    }
    if (interval.end > sourceDuration + tolerance) {
      throw new UserInputError(`Invalid render plan: segment ${index + 1} exceeds the source duration.`);
    }
    if (interval.start < previousEnd - tolerance) {
      throw new UserInputError("Invalid render plan: segments must be ordered and non-overlapping.");
    }
    if (interval.events.length === 0 || interval.events.some((event) => !event.id.trim())) {
      throw new UserInputError(`Invalid render plan: segment ${index + 1} has no valid event IDs.`);
    }
    previousEnd = interval.end;
  }
};

const outputDurationTolerance = (expectedDuration: number): number => Math.max(0.5, expectedDuration * 0.02);

const runRenderStage = async (stage: "Segment render" | "Concat", args: string[], timeoutMs: number): Promise<void> => {
  try {
    await runCommand("ffmpeg", args, timeoutMs);
  } catch (error) {
    console.error(`${stage} failed:`, error);
    throw new UserInputError(`${stage} failed.`);
  }
};

export const validateRenderedOutput = async (
  file: string,
  expectedDuration: number,
  timeoutMs: number
): Promise<RenderValidationResult> => {
  const result: RenderValidationResult = {
    valid: false,
    expectedDuration,
    hasVideo: false,
    hasAudio: false,
    warnings: [],
    errors: []
  };
  const info = await stat(file);
  if (!info.isFile() || info.size === 0) {
    result.errors.push("Output file is empty.");
    return result;
  }
  const metadata = await inspectMedia(file, timeoutMs);
  const duration = positiveNumber(metadata.format?.duration);
  const video = metadata.streams?.find((stream) => stream.codec_type === "video");
  const audio = metadata.streams?.find((stream) => stream.codec_type === "audio");
  const width = video?.width;
  const height = video?.height;
  result.hasVideo = Boolean(video);
  result.hasAudio = Boolean(audio);
  result.actualDuration = duration;
  if (!video || typeof width !== "number" || typeof height !== "number" || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    result.errors.push("Output has no readable video stream.");
  }
  if (!audio) result.errors.push("Output has no audio stream.");
  if (!duration) {
    result.errors.push("Output has no positive duration.");
  } else {
    result.durationError = Math.abs(duration - expectedDuration);
    if (result.durationError > outputDurationTolerance(expectedDuration)) {
      result.errors.push(`Output duration differs from the render plan by ${result.durationError.toFixed(3)} seconds.`);
    }
  }
  const startTime = positiveNumber(metadata.format?.start_time);
  if (startTime && startTime > 0.1) result.warnings.push(`Output timeline starts at ${startTime.toFixed(3)} seconds.`);
  result.valid = result.errors.length === 0;
  return result;
};

const concatListEntry = (file: string): string => `file '${file.replaceAll("'", "'\\''")}'`;
const seconds = (value: number): string => value.toFixed(3);
const approachScaleExpression = (duration: number): string => {
  const finalApproach = Math.min(COIN_FINAL_EXPAND_SECONDS, duration);
  const steadyApproach = duration - finalApproach;
  if (steadyApproach === 0) return `240*(0.05+2.95*t/${seconds(finalApproach)})`;
  return `240*if(lt(t,${seconds(steadyApproach)}),0.05+0.95*t/${seconds(steadyApproach)},1+2*(t-${seconds(steadyApproach)})/${seconds(finalApproach)})`;
};

interface EffectPlan {
  event: number;
  approachStart: number;
  collectEnd: number;
  rewardEnd: number;
}

export const planCoinEffect = (event: number, clipDuration: number): EffectPlan => {
  const boundedEvent = Math.max(0, Math.min(event, clipDuration));
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    event: round(boundedEvent),
    approachStart: round(Math.max(0, boundedEvent - COIN_APPROACH_SECONDS)),
    collectEnd: round(Math.min(clipDuration, boundedEvent + COIN_COLLECT_SECONDS)),
    rewardEnd: round(Math.min(clipDuration, boundedEvent + COIN_REWARD_SECONDS))
  };
};

const buildAudioFilter = (audioPresent: boolean, clipDuration: number, effects: EffectPlan[]): { filter: string; output: string } => {
  const duckIntervals = effects.map((effect) => `between(t,${seconds(Math.max(0, effect.event - 0.04))},${seconds(effect.collectEnd)})`);
  const duckExpression = duckIntervals.length === 0 ? "1" : `if(${duckIntervals.join("+")},0.35,1)`;
  const filters = [
    audioPresent
      ? `[0:a]atrim=duration=${seconds(clipDuration)},asetpts=PTS-STARTPTS,volume='${duckExpression}':eval=frame[basea]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(clipDuration)}[basea]`
  ];
  const chimes = effects.map((effect, index) => {
    const label = `chime${index}`;
    filters.push(
      `sine=frequency=1318:sample_rate=48000:duration=0.180,afade=t=out:st=0.120:d=0.060,aformat=channel_layouts=stereo,asetpts=PTS+${seconds(effect.event)}/TB[${label}]`
    );
    return `[${label}]`;
  });
  filters.push(`[basea]${chimes.join("")}amix=inputs=${chimes.length + 1}:duration=first:dropout_transition=0[aout]`);
  return { filter: filters.join(";"), output: "[aout]" };
};

export const buildSegmentFilter = (
  interval: ClipInterval,
  audioPresent: boolean
): { filter: string; videoOutput: string; audioOutput: string } => {
  const clipDuration = interval.end - interval.start;
  let videoLabel = "[0:v]";
  const filters: string[] = [];
  const effects = interval.events.map((event) => planCoinEffect(event.videoSecond - interval.start, clipDuration));

  for (const [index, effect] of effects.entries()) {
    const source = 1 + index * 3;
    const approachDuration = effect.event - effect.approachStart;
    if (approachDuration > 0) {
      filters.push(
        `[${source}:v]trim=duration=${seconds(approachDuration)},setpts=PTS-STARTPTS,scale=w='${approachScaleExpression(approachDuration)}':h=-1:eval=frame,fade=t=in:st=0:d=${seconds(approachDuration)}:alpha=1,setpts=PTS+${seconds(effect.approachStart)}/TB[approach${index}]`
      );
      const next = `v${index}-approach`;
      filters.push(`${videoLabel}[approach${index}]overlay=(W-w)/2:(H-h)/2:format=auto:eof_action=pass:repeatlast=0[${next}]`);
      videoLabel = `[${next}]`;
    }
    filters.push(
      `[${source}:v]trim=duration=${seconds(effect.collectEnd - effect.event)},setpts=PTS-STARTPTS,scale=w='240*(3+0.35*t/${COIN_COLLECT_SECONDS})':h=-1:eval=frame,fade=t=out:st=0:d=${COIN_COLLECT_SECONDS}:alpha=1,setpts=PTS+${seconds(effect.event)}/TB[pop${index}]`,
      `[${source + 1}:v]trim=duration=${seconds(effect.collectEnd - effect.event)},setpts=PTS-STARTPTS,scale=w='320*(0.65+0.7*t/${COIN_COLLECT_SECONDS})':h=-1:eval=frame,fade=t=out:st=0:d=${COIN_COLLECT_SECONDS}:alpha=1,setpts=PTS+${seconds(effect.event)}/TB[burst${index}]`,
      `[${source + 2}:v]trim=duration=${seconds(effect.rewardEnd - effect.event)},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.100:alpha=1,fade=t=out:st=0.700:d=0.250:alpha=1,setpts=PTS+${seconds(effect.event)}/TB[reward${index}]`
    );
    for (const label of [`pop${index}`, `burst${index}`]) {
      const next = `v${index}-${label}`;
      filters.push(`${videoLabel}[${label}]overlay=(W-w)/2:(H-h)/2:format=auto:eof_action=pass:repeatlast=0[${next}]`);
      videoLabel = `[${next}]`;
    }
    const next = `v${index}-reward`;
    filters.push(
      `${videoLabel}[reward${index}]overlay=(W-w)/2:(H-h)/2-80*(t-${seconds(effect.event)}):format=auto:eof_action=pass:repeatlast=0[${next}]`
    );
    videoLabel = `[${next}]`;
  }
  const audio = buildAudioFilter(audioPresent, clipDuration, effects);
  filters.push(audio.filter);
  return { filter: filters.join(";"), videoOutput: videoLabel, audioOutput: audio.output };
};

export const buildHudSegmentFilter = (
  clipDuration: number,
  audioPresent: boolean,
  layers: { map: boolean; feed: boolean }
): { filter: string; videoOutput: string; audioOutput: string } => {
  const filters = [`[0:v]trim=duration=${seconds(clipDuration)},setpts=PTS-STARTPTS[base]`];
  let videoOutput = "[base]";
  let input = 1;
  for (const layer of [
    { enabled: layers.map, x: "W-w-24", y: "H-h-24", label: "map" },
    { enabled: layers.feed, x: "W-w-24", y: "24", label: "feed" }
  ]) {
    if (!layer.enabled) continue;
    filters.push(`[${input}:v]setpts=PTS-STARTPTS[${layer.label}]`);
    const output = `hud-${layer.label}`;
    filters.push(`${videoOutput}[${layer.label}]overlay=${layer.x}:${layer.y}:format=auto:eof_action=pass:repeatlast=1[${output}]`);
    videoOutput = `[${output}]`;
    input += 1;
  }
  filters.push(
    audioPresent
      ? `[0:a]atrim=duration=${seconds(clipDuration)},asetpts=PTS-STARTPTS[aout]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(clipDuration)}[aout]`
  );
  return { filter: filters.join(";"), videoOutput, audioOutput: "[aout]" };
};

export const renderSelectedClips = async (
  input: string,
  output: string,
  events: MappedGameEvent[],
  duration: number,
  workDirectory: string,
  timeoutMs: number,
  hudTimeline?: HudTimeline
): Promise<RenderSummary> => {
  const intervals = buildClipIntervals(events, duration);
  let media: MediaInfo;
  try {
    media = await inspectMediaInfo(input, timeoutMs);
  } catch (error) {
    console.error("Source media inspection failed:", error);
    throw new UserInputError("Unsupported media: the source could not be inspected.");
  }
  validateClipIntervals(intervals, media.duration);
  const startedAt = Date.now();
  const renderDirectory = await mkdtemp(path.join(workDirectory, "render-"));
  const expectedDuration = intervals.reduce((total, interval) => total + interval.end - interval.start, 0);
  const audioPresent = media.audio !== undefined;
  const videoSize = hudTimeline && config.hudEnabled && !config.showLegacyCoinOverlay
    ? { width: media.width, height: media.height }
    : undefined;
  const segmentFiles: string[] = [];
  try {
    for (const [intervalIndex, interval] of intervals.entries()) {
      const useHud = hudTimeline !== undefined && config.hudEnabled && !config.showLegacyCoinOverlay;
      const useLegacy = !useHud && config.showLegacyCoinOverlay;
      const assets = useLegacy
        ? await Promise.all(
            interval.events.map((event, index) => createCoinEffectAssets(path.join(renderDirectory, `effect-${intervalIndex}-${index}`), event.value))
          )
        : [];
      const inputArgs = ["-ss", seconds(interval.start), "-i", input];
      let plan: { filter: string; videoOutput: string; audioOutput: string };
      if (useHud) {
        const frames = await renderHudFrames(
          path.join(renderDirectory, `hud-${intervalIndex}`),
          interval.start,
          interval.end,
          videoSize!.width,
          videoSize!.height,
          hudTimeline!,
          {
            minimapEnabled: config.minimapEnabled,
            eventFeedEnabled: config.eventFeedEnabled,
            nextItemEnabled: config.nextItemEnabled,
            mapRangeMeters: config.mapRangeMeters,
            eventFeedDurationSeconds: config.eventFeedDurationSeconds,
            eventFeedMaxItems: config.eventFeedMaxItems,
            frameRate: config.hudFrameRate
          }
        );
        if (frames.mapPattern) inputArgs.push("-framerate", String(config.hudFrameRate), "-start_number", "0", "-i", frames.mapPattern);
        if (frames.feedPattern) inputArgs.push("-framerate", String(config.hudFrameRate), "-start_number", "0", "-i", frames.feedPattern);
        plan = buildHudSegmentFilter(interval.end - interval.start, audioPresent, { map: Boolean(frames.mapPattern), feed: Boolean(frames.feedPattern) });
      } else if (useLegacy) {
        for (const asset of assets) inputArgs.push("-loop", "1", "-i", asset.coin, "-loop", "1", "-i", asset.burst, "-loop", "1", "-i", asset.reward);
        plan = buildSegmentFilter(interval, audioPresent);
      } else {
        plan = buildHudSegmentFilter(interval.end - interval.start, audioPresent, { map: false, feed: false });
      }
      const segmentFile = path.join(renderDirectory, `segment-${intervalIndex}.mp4`);
      await runRenderStage(
        "Segment render",
        [
          "-y",
          ...inputArgs,
          "-t",
          seconds(interval.end - interval.start),
          "-filter_complex",
          plan.filter,
          "-map",
          plan.videoOutput,
          "-map",
          plan.audioOutput,
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          segmentFile
        ],
        timeoutMs
      );
      segmentFiles.push(segmentFile);
    }
    const listFile = path.join(renderDirectory, "segments.txt");
    await writeFile(listFile, `${segmentFiles.map(concatListEntry).join("\n")}\n`);
    await runRenderStage(
      "Concat",
      ["-y", "-fflags", "+genpts", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", output],
      timeoutMs
    );
    let validation: RenderValidationResult;
    try {
      validation = await validateRenderedOutput(output, expectedDuration, timeoutMs);
    } catch (error) {
      console.error("Output validation probe failed:", error);
      throw new UserInputError("Output validation failed: the completed file could not be inspected.");
    }
    if (!validation.valid) {
      throw new UserInputError(`Output validation failed: ${validation.errors.join(" ")}`);
    }
    const elapsedMs = Date.now() - startedAt;
    return {
      status: "succeeded",
      segmentCount: intervals.length,
      expectedDuration,
      actualDuration: validation.actualDuration!,
      audioPresent,
      warnings: validation.warnings,
      elapsedMs,
      speedRatio: elapsedMs > 0 ? expectedDuration / (elapsedMs / 1000) : undefined
    };
  } finally {
    await rm(renderDirectory, { recursive: true, force: true });
  }
};
