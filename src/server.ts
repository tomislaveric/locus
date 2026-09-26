import { randomBytes } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { deriveActivity, deriveActivityResult } from "./activity.js";
import { readCoins } from "./coin.js";
import { config } from "./config.js";
import type { HudTimeline, Job, MappedGameEvent } from "./domain.js";
import { UserInputError } from "./errors.js";
import { parseFitTrack } from "./fit.js";
import { detectFirstCoinPassages } from "./geometry.js";
import { extractGps5Times, mapToVideoSecond } from "./gpmf.js";
import {
  assessSynchronization,
  withEventAvailability,
  SynchronizationError
} from "./synchronization.js";
import { createHudTimeline, loadHudTimeline, saveHudTimeline } from "./hud/timeline.js";
import { buildClipIntervals, gpmfStreamIndex, probeDuration, renderSelectedClips } from "./video.js";

interface UploadRequest extends Request {
  job?: Job;
  jobDir?: string;
}

let busy = false;

const jobFile = (directory: string): string => path.join(directory, "job.json");

const saveJob = async (directory: string, job: Job): Promise<void> => {
  job.updatedAt = new Date().toISOString();
  await writeFile(jobFile(directory), JSON.stringify(job, null, 2));
};

const validToken = (token: string): boolean => /^[a-f0-9]{48}$/.test(token);

const loadJob = async (token: string): Promise<{ job: Job; directory: string }> => {
  if (!validToken(token)) throw new UserInputError("Unknown job.");
  const directory = path.join(config.dataDir, token);
  try {
    const job = JSON.parse(await readFile(jobFile(directory), "utf8")) as Job;
    return { job, directory };
  } catch {
    throw new UserInputError("Unknown or expired job.");
  }
};

const storage = multer.diskStorage({
  destination: (request, _file, callback) => callback(null, (request as UploadRequest).jobDir ?? ""),
  filename: (_request, file, callback) => {
    callback(null, file.fieldname === "fit" ? "track.fit" : "video.mp4");
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 2 },
  fileFilter: (_request, file, callback) => {
    if (file.fieldname === "fit" || file.fieldname === "video") callback(null, true);
    else callback(new UserInputError("Only fit and video upload fields are supported."));
  }
});

const reserveJob = async (request: UploadRequest, response: Response, next: NextFunction): Promise<void> => {
  if (busy) {
    response.status(429).json({ error: "The renderer is busy. Try again after the current job finishes." });
    return;
  }
  busy = true;
  const token = randomBytes(24).toString("hex");
  const directory = path.join(config.dataDir, token);
  const job: Job = {
    token,
    state: "processing",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  try {
    await mkdir(directory, { recursive: false });
    await saveJob(directory, job);
    request.job = job;
    request.jobDir = directory;
    next();
  } catch (error) {
    busy = false;
    next(error);
  }
};

const cleanupReservation = async (request: UploadRequest): Promise<void> => {
  busy = false;
  if (request.jobDir) await rm(request.jobDir, { recursive: true, force: true });
};

const processDetection = async (directory: string, job: Job, hasVideo: boolean): Promise<void> => {
  try {
    const coins = await readCoins(config.coinsFile);
    const fit = path.join(directory, "track.fit");
    const track = await parseFitTrack(fit);
    const activity = deriveActivity(job.token, track);
    const activityResult = deriveActivityResult(activity, coins);
    job.activity = activity;
    job.activityResult = activityResult;
    job.resultMode = hasVideo ? "video" : "activity";

    if (!hasVideo) {
      job.state = "succeeded";
      return;
    }

    const video = path.join(directory, "video.mp4");
    const sourceDuration = await probeDuration(video, config.processTimeoutMs);
    const streamIndex = await gpmfStreamIndex(video, config.processTimeoutMs);
    const samples = await extractGps5Times(
      video,
      path.join(directory, "metadata.gpmf"),
      streamIndex,
      config.processTimeoutMs
    );
    const assessment = assessSynchronization(
      track,
      samples,
      sourceDuration,
      config.fitSampleGapWarningSeconds
    );
    const mappedEvents: MappedGameEvent[] = [];
    for (const event of activityResult.events) {
      const videoSecond = mapToVideoSecond(event.activityTimestamp, samples);
      if (videoSecond < 0 || videoSecond > sourceDuration) continue;
      mappedEvents.push({
        ...event,
        videoSecond: Number(videoSecond.toFixed(3))
      });
    }
    if (mappedEvents.length === 0) {
      job.synchronization = withEventAvailability(
        assessment,
        activityResult.events.map((event) => event.activityTimestamp)
      );
      throw new UserInputError("No configured coin passage maps to a time within the video.");
    }
    const allEvents = mappedEvents.sort((left, right) => left.videoSecond - right.videoSecond);
    await saveHudTimeline(
      path.join(directory, "hud-timeline.json"),
      createHudTimeline(track, coins, allEvents, samples, sourceDuration)
    );
    job.state = "awaiting_selection";
    job.sourceDuration = sourceDuration;
    job.mappedEvents = allEvents;
    job.synchronization = withEventAvailability(
      assessment,
      activityResult.events.map((event) => event.activityTimestamp)
    );
  } catch (error) {
    job.state = "failed";
    job.error = error instanceof Error ? error.message : "Unexpected processing failure.";
    if (error instanceof SynchronizationError) {
      job.synchronization = error.summary;
    }
    console.error(`Job ${job.token} failed:`, error);
  } finally {
    try {
      await saveJob(directory, job);
    } finally {
      busy = false;
    }
  }
};

const renderSelection = async (
  directory: string,
  job: Job,
  events: MappedGameEvent[]
): Promise<void> => {
  try {
    if (job.sourceDuration === undefined) throw new UserInputError("Job has no source video duration.");
    const hudTimeline: HudTimeline | undefined = config.hudEnabled && !config.showLegacyCoinOverlay
      ? await loadHudTimeline(path.join(directory, "hud-timeline.json"))
      : undefined;
    const outputFile = "clip.mp4";
    job.render = await renderSelectedClips(
      path.join(directory, "video.mp4"),
      path.join(directory, outputFile),
      events,
      job.sourceDuration,
      directory,
      config.processTimeoutMs,
      hudTimeline
    );
    job.state = "succeeded";
    job.outputFile = outputFile;
  } catch (error) {
    job.state = "failed";
    job.error = error instanceof Error ? error.message : "Unexpected rendering failure.";
    console.error(`Job ${job.token} rendering failed:`, error);
  } finally {
    try {
      await saveJob(directory, job);
    } finally {
      busy = false;
    }
  }
};

const selectedEvents = (job: Job, value: unknown): MappedGameEvent[] => {
  if (!Array.isArray(value) || value.length === 0 || !value.every((id) => typeof id === "string")) {
    throw new UserInputError("Select at least one detected coin id.");
  }
  if (value.length > config.maxSelectedCoins) {
    throw new UserInputError(`Select no more than ${config.maxSelectedCoins} coins.`);
  }
  const ids = new Set(value);
  if (ids.size !== value.length) throw new UserInputError("Selected coin ids must be unique.");
  const knownEvents = new Map((job.mappedEvents ?? []).map((event) => [event.id, event]));
  const events = value.map((id) => knownEvents.get(id));
  if (events.some((event) => event === undefined)) {
    throw new UserInputError("Selection contains an unknown detected coin.");
  }
  return (events as MappedGameEvent[]).sort(
    (left, right) => left.videoSecond - right.videoSecond
  );
};

const cleanExpiredJobs = async (): Promise<void> => {
  const { readdir } = await import("node:fs/promises");
  let entries: string[];
  try {
    entries = await readdir(config.dataDir);
  } catch (error) {
    console.error("Could not scan expired jobs:", error);
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const directory = path.join(config.dataDir, entry);
      try {
        const info = await stat(directory);
        if (!info.isDirectory()) return;
        let expired = Date.now() - info.mtimeMs > config.jobTtlMs;
        try {
          const job = JSON.parse(await readFile(jobFile(directory), "utf8")) as Job;
          const updatedAt = new Date(job.updatedAt).getTime();
          const ttl = job.state === "awaiting_selection" ? config.selectionTtlMs : config.jobTtlMs;
          expired = !Number.isFinite(updatedAt) || Date.now() - updatedAt > ttl;
        } catch {
          // The directory-mtime fallback removes incomplete or corrupt job directories.
        }
        if (expired) {
          await rm(directory, { recursive: true, force: true });
        }
      } catch (error) {
        console.error(`Could not clean job directory ${entry}:`, error);
      }
    })
  );
};

await mkdir(config.dataDir, { recursive: true });
await cleanExpiredJobs();
setInterval(() => void cleanExpiredJobs(), Math.min(config.jobTtlMs, 60_000)).unref();

const app = express();
app.use(express.static(path.resolve("public")));
app.use(express.json({ limit: "16kb" }));

app.post(
  "/api/jobs",
  reserveJob,
  upload.fields([{ name: "fit", maxCount: 1 }, { name: "video", maxCount: 1 }]),
  async (request: UploadRequest, response, next) => {
    const files = request.files as Record<string, Express.Multer.File[]> | undefined;
    if (!request.job || !request.jobDir || !files?.fit?.[0]) {
      await cleanupReservation(request);
      response.status(400).json({ error: "One FIT file is required." });
      return;
    }
    void processDetection(request.jobDir, request.job, Boolean(files.video?.[0]));
    response.status(202).json({ token: request.job.token });
    next();
  }
);

app.get("/api/jobs/:token", async (request, response) => {
  try {
    const { job } = await loadJob(request.params.token);
    response.json({
      token: job.token,
      state: job.state,
      error: job.error,
      resultMode: job.resultMode,
      activityReady: Boolean(job.activity && job.activityResult),
      events: job.mappedEvents,
      render: job.render,
      synchronization: job.synchronization,
      downloadUrl: job.state === "succeeded" && job.outputFile ? `/api/jobs/${job.token}/download` : undefined
    });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Unknown job." });
  }
});

app.get("/api/jobs/:token/activity", async (request, response) => {
  try {
    const { job } = await loadJob(request.params.token);
    if (!job.activity || !job.activityResult || job.state === "processing") {
      response.status(409).json({ error: "Activity results are not ready." });
      return;
    }
    response.json({ activity: job.activity, activityResult: job.activityResult });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Activity unavailable." });
  }
});

app.post("/api/jobs/:token/render", async (request, response) => {
  try {
    const { job, directory } = await loadJob(request.params.token);
    if (job.state !== "awaiting_selection") {
      response.status(409).json({ error: "This job is not ready for selection rendering." });
      return;
    }
    if (busy) {
      response.status(429).json({ error: "The renderer is busy. Try again after the current job finishes." });
      return;
    }
    const events = selectedEvents(job, request.body?.coinIds);
    if (job.sourceDuration === undefined) throw new UserInputError("Job has no source video duration.");
    const totalDuration = buildClipIntervals(events, job.sourceDuration).reduce(
      (total, interval) => total + interval.end - interval.start,
      0
    );
    if (totalDuration > config.maxOutputDurationSeconds) {
      throw new UserInputError(
        `Selected clips exceed the ${config.maxOutputDurationSeconds}-second output limit.`
      );
    }
    busy = true;
    job.state = "rendering";
    try {
      await saveJob(directory, job);
    } catch (error) {
      busy = false;
      throw error;
    }
    void renderSelection(directory, job, events);
    response.status(202).json({ token: job.token, state: job.state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not render the selected clips.";
    response.status(error instanceof UserInputError ? 400 : 500).json({ error: message });
  }
});

app.get("/api/jobs/:token/download", async (request, response) => {
  try {
    const { job, directory } = await loadJob(request.params.token);
    if (job.state !== "succeeded" || !job.outputFile) {
      response.status(409).json({ error: "The clip is not ready." });
      return;
    }
    await access(path.join(directory, job.outputFile));
    response.download(path.join(directory, job.outputFile), "coin-clip.mp4");
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Clip unavailable." });
  }
});

app.use((error: Error, request: UploadRequest, response: Response, _next: NextFunction) => {
  console.error("Request failed:", error);
  if (request.jobDir) void cleanupReservation(request);
  response.status(error instanceof multer.MulterError ? 400 : 500).json({
    error: error instanceof multer.MulterError ? `Upload rejected: ${error.message}` : error.message
  });
});

app.listen(config.port, () => {
  console.log(`Post-ride AR POC listening on port ${config.port}`);
});
