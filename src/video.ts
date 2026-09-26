import { writeFile } from "node:fs/promises";
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
import type { GameEvent, HudTimeline } from "./domain.js";
import { UserInputError } from "./errors.js";
import { renderHudFrames } from "./hud/hudRenderer.js";

interface ProbeFormat {
  duration?: string;
}

interface ProbeResult {
  format?: ProbeFormat;
  streams?: Array<{ index?: number; codec_type?: string; codec_tag_string?: string; width?: number; height?: number }>;
}

export interface ClipInterval {
  start: number;
  end: number;
  events: GameEvent[];
}

export const probeDuration = async (file: string, timeoutMs: number): Promise<number> => {
  const metadata = await inspectMedia(file, timeoutMs);
  const duration = Number(metadata.format?.duration);
  if (!Number.isFinite(duration) || duration < 4) throw new UserInputError("Video must be at least four seconds long.");
  return duration;
};

export const gpmfStreamIndex = async (file: string, timeoutMs: number): Promise<number> => {
  const metadata = await inspectMedia(file, timeoutMs);
  const stream = metadata.streams?.find((candidate) => candidate.codec_type === "data" && candidate.codec_tag_string === "gpmd");
  if (stream?.index === undefined) {
    throw new UserInputError("MP4 has no GPMF metadata track. Upload the original GoPro MP4, not an exported or trimmed copy.");
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

export const buildClipIntervals = (events: GameEvent[], duration: number): ClipInterval[] => {
  const clipDuration = Math.min(6, duration);
  const windows = [...events]
    .sort((left, right) => left.videoSecond - right.videoSecond)
    .map((event) => {
      const start = Math.max(0, Math.min(event.videoSecond - 3, duration - clipDuration));
      return { start, end: start + clipDuration, events: [event] };
    });
  return windows.reduce<ClipInterval[]>((intervals, window) => {
    const previous = intervals.at(-1);
    if (previous && window.start <= previous.end) {
      previous.end = Math.max(previous.end, window.end);
      previous.events.push(...window.events);
    } else intervals.push(window);
    return intervals;
  }, []);
};

const inspectMedia = async (file: string, timeoutMs: number): Promise<ProbeResult> => {
  const output = await runCommand("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], timeoutMs);
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
  events: GameEvent[],
  duration: number,
  workDirectory: string,
  timeoutMs: number,
  hudTimeline?: HudTimeline
): Promise<void> => {
  const intervals = buildClipIntervals(events, duration);
  if (intervals.length === 0) throw new UserInputError("Select at least one detected coin.");
  const audioPresent = await hasAudio(input, timeoutMs);
  const videoSize = hudTimeline && config.hudEnabled && !config.showLegacyCoinOverlay
    ? await probeVideoSize(input, timeoutMs)
    : undefined;
  const segmentFiles: string[] = [];
  for (const [intervalIndex, interval] of intervals.entries()) {
    const useHud = hudTimeline !== undefined && config.hudEnabled && !config.showLegacyCoinOverlay;
    const useLegacy = !useHud && config.showLegacyCoinOverlay;
    const assets = useLegacy
      ? await Promise.all(
          interval.events.map((event, index) => createCoinEffectAssets(path.join(workDirectory, `effect-${intervalIndex}-${index}`), event.value))
        )
      : [];
    const inputArgs = ["-ss", seconds(interval.start), "-i", input];
    let plan: { filter: string; videoOutput: string; audioOutput: string };
    if (useHud) {
      const frames = await renderHudFrames(
        path.join(workDirectory, `hud-${intervalIndex}`),
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
    const segmentFile = path.join(workDirectory, `segment-${intervalIndex}.mp4`);
    await runCommand(
      "ffmpeg",
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
  const listFile = path.join(workDirectory, "segments.txt");
  await writeFile(listFile, `${segmentFiles.map(concatListEntry).join("\n")}\n`);
  await runCommand("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-movflags", "+faststart", output], timeoutMs);
  await probeDuration(output, timeoutMs);
};
