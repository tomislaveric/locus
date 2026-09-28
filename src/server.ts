import { randomBytes, randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { deriveActivity, deriveActivityResult } from "./activity.js";
import { readCollectibles } from "./coin.js";
import { config } from "./config.js";
import type { ActivityImportResult, ActivityVideo, HudTimeline, Job, MappedGameEvent, PersistedActivity } from "./domain.js";
import { UserInputError } from "./errors.js";
import { parseFitTrack } from "./fit.js";
import { extractGps5Times, mapToVideoSecond } from "./gpmf.js";
import {
  assessSynchronization,
  withEventAvailability,
  SynchronizationError
} from "./synchronization.js";
import { createHudTimeline, loadHudTimeline, saveHudTimeline } from "./hud/timeline.js";
import { ActivityRepository } from "./persistence/activityRepository.js";
import { createDatabasePool } from "./persistence/database.js";
import { migrate } from "./persistence/migrate.js";
import { buildClipIntervals, gpmfStreamIndex, probeDuration, renderSelectedClips } from "./video.js";
import { getRelevantCollectibles } from "./worldQuery.js";
import { createWorldSnapshot } from "./world.js";

interface UploadRequest extends Request {
  job?: Job;
  jobDir?: string;
}

let busy = false;

if (!config.databaseUrl) throw new Error("DATABASE_URL is required.");
const databasePool = createDatabasePool(config.databaseUrl);
await migrate(databasePool);
const activityRepository = new ActivityRepository(
  databasePool,
  config.defaultPlayerId,
  config.defaultPlayerName
);
await activityRepository.initializeDefaultPlayer();
await activityRepository.markInterruptedActivityVideos();

const jobFile = (directory: string): string => path.join(directory, "job.json");

const saveJob = async (directory: string, job: Job): Promise<void> => {
  job.updatedAt = new Date().toISOString();
  const file = jobFile(directory);
  const temporaryFile = `${file}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(job, null, 2));
  await rename(temporaryFile, file);
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
const lateVideoUpload = multer({
  dest: config.dataDir,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (file.fieldname === "video") callback(null, true);
    else callback(new UserInputError("Only the video upload field is supported."));
  }
});
const importUpload = multer({
  dest: config.dataDir,
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

const processDetection = async (
  directory: string,
  job: Job,
  hasVideo: boolean,
  repository: ActivityRepository
): Promise<void> => {
  try {
    const collectibles = await readCollectibles(config.coinsFile);
    const fit = path.join(directory, "track.fit");
    const track = await parseFitTrack(fit);
    const activity = deriveActivity(job.token, track);
    const relevantCollectibles = getRelevantCollectibles(collectibles, track, config.worldQueryPaddingMeters);
    const activityResult = deriveActivityResult(activity, relevantCollectibles);
    job.activity = activity;
    job.activityResult = activityResult;
    job.world = {
      totalCollectibles: collectibles.length,
      relevantCollectibles: relevantCollectibles.length
    };
    job.resultMode = hasVideo ? "video" : "activity";
    await repository.persistCompletedActivity(activity, activityResult);

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
      createHudTimeline(track, activityResult.collectibles, allEvents, samples, sourceDuration)
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
  events: MappedGameEvent[],
  repository: ActivityRepository
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
    await repository.markActivityHasVideo(job.token);
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
    throw new UserInputError("Select at least one detected collectible id.");
  }
  if (value.length > config.maxSelectedCoins) {
    throw new UserInputError(`Select no more than ${config.maxSelectedCoins} collectibles.`);
  }
  const ids = new Set(value);
  if (ids.size !== value.length) throw new UserInputError("Selected collectible ids must be unique.");
  const knownEvents = new Map((job.mappedEvents ?? []).map((event) => [event.sourceId, event]));
  const events = value.map((id) => knownEvents.get(id));
  if (events.some((event) => event === undefined)) {
    throw new UserInputError("Selection contains an unknown detected collectible.");
  }
  return (events as MappedGameEvent[]).sort(
    (left, right) => left.videoSecond - right.videoSecond
  );
};

const selectedMappedEvents = (mappedEvents: MappedGameEvent[] | undefined, value: unknown): MappedGameEvent[] => {
  if (!Array.isArray(value) || value.length === 0 || !value.every((id) => typeof id === "string")) {
    throw new UserInputError("Select at least one detected collectible id.");
  }
  if (value.length > config.maxSelectedCoins) {
    throw new UserInputError(`Select no more than ${config.maxSelectedCoins} collectibles.`);
  }
  const ids = new Set(value);
  if (ids.size !== value.length) throw new UserInputError("Selected collectible ids must be unique.");
  const knownEvents = new Map((mappedEvents ?? []).map((event) => [event.sourceId, event]));
  const events = value.map((id) => knownEvents.get(id));
  if (events.some((event) => event === undefined)) throw new UserInputError("Selection contains an unknown detected collectible.");
  return (events as MappedGameEvent[]).sort((left, right) => left.videoSecond - right.videoSecond);
};

const activityMediaDirectory = (activityId: string, mediaId: string): string =>
  path.join(config.mediaDir, activityId, mediaId);

const attachVideoUrls = (activity: PersistedActivity): PersistedActivity => {
  if (!activity.video) return activity;
  const video = activity.video;
  return {
    ...activity,
    video: {
      ...video,
      ...(video.state === "succeeded" ? {
        previewUrl: `/api/activities/${encodeURIComponent(activity.id)}/video/preview`,
        downloadUrl: `/api/activities/${encodeURIComponent(activity.id)}/video/download`
      } : {})
    }
  };
};

const processAttachedVideo = async (
  activity: PersistedActivity,
  mediaId: string,
  mediaDirectory: string
): Promise<void> => {
  const video = activity.video;
  const replay = activity.replay;
  if (!video || !replay) return;
  try {
    const sourcePath = path.join(mediaDirectory, "source.mp4");
    const sourceDuration = await probeDuration(sourcePath, config.processTimeoutMs);
    const streamIndex = await gpmfStreamIndex(sourcePath, config.processTimeoutMs);
    const samples = await extractGps5Times(sourcePath, path.join(mediaDirectory, "metadata.gpmf"), streamIndex, config.processTimeoutMs);
    const assessment = assessSynchronization(replay.activity.route, samples, sourceDuration, config.fitSampleGapWarningSeconds);
    const mappedEvents = replay.activityResult.events.flatMap((event) => {
      const videoSecond = mapToVideoSecond(event.activityTimestamp, samples);
      return videoSecond < 0 || videoSecond > sourceDuration ? [] : [{ ...event, videoSecond: Number(videoSecond.toFixed(3)) }];
    }).sort((left, right) => left.videoSecond - right.videoSecond);
    const synchronization = withEventAvailability(assessment, replay.activityResult.events.map((event) => event.activityTimestamp));
    if (mappedEvents.length === 0) throw new UserInputError("No configured coin passage maps to a time within the video.");
    await saveHudTimeline(
      path.join(mediaDirectory, "hud-timeline.json"),
      createHudTimeline(replay.activity.route, replay.activityResult.collectibles, mappedEvents, samples, sourceDuration)
    );
    await activityRepository.updateActivityVideo(activity.id, {
      ...video, mediaId, state: "awaiting_selection", sourceDuration, synchronization, events: mappedEvents
    });
  } catch (error) {
    const synchronization = error instanceof SynchronizationError ? error.summary : undefined;
    await activityRepository.updateActivityVideo(activity.id, {
      ...video, mediaId, state: "sync_failed", synchronization,
      error: error instanceof Error ? error.message : "Unexpected video synchronization failure."
    });
    console.error(`Activity video ${mediaId} synchronization failed:`, error);
  } finally {
    busy = false;
  }
};

const attachUploadedVideo = async (
  activity: PersistedActivity,
  uploaded: Express.Multer.File
): Promise<{ video?: ActivityVideo; videoError?: string }> => {
  const mediaId = randomUUID();
  const directory = activityMediaDirectory(activity.id, mediaId);
  const sourcePath = path.join(directory, "source.mp4");
  await mkdir(directory, { recursive: true });
  try {
    await rename(uploaded.path, sourcePath);
    const video = await activityRepository.createActivityVideo(activity.id, mediaId, uploaded.originalname, sourcePath);
    if (busy) {
      const videoError = "Video processing is busy. Attach this video again after the current processing finishes.";
      await activityRepository.updateActivityVideo(activity.id, { ...video, state: "sync_failed", error: videoError });
      return { video: { ...video, state: "sync_failed", error: videoError }, videoError };
    }
    busy = true;
    void processAttachedVideo({ ...activity, video }, mediaId, directory);
    return { video: { ...video, state: "syncing" } };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};

const importActivity = async (
  importKey: string,
  fit: Express.Multer.File,
  uploadedVideo?: Express.Multer.File
): Promise<ActivityImportResult> => {
  const existing = await activityRepository.getActivityByImportKey(importKey);
  if (existing) {
    await Promise.all([rm(fit.path, { force: true }), uploadedVideo ? rm(uploadedVideo.path, { force: true }) : Promise.resolve()]);
    return { activity: attachVideoUrls(existing), inserted: false };
  }

  try {
    const [collectibles, track] = await Promise.all([
      readCollectibles(config.coinsFile),
      parseFitTrack(fit.path)
    ]);
    const activity = deriveActivity(randomUUID(), track);
    const relevantCollectibles = getRelevantCollectibles(collectibles, track, config.worldQueryPaddingMeters);
    const activityResult = deriveActivityResult(activity, relevantCollectibles);
    const persisted = await activityRepository.persistCompletedActivity(activity, activityResult, importKey);
    let importedActivity = persisted.activity;
    let videoError: string | undefined;
    if (persisted.inserted && uploadedVideo) {
      try {
        const attachment = await attachUploadedVideo(importedActivity, uploadedVideo);
        if (attachment.video) importedActivity = { ...importedActivity, video: attachment.video };
        videoError = attachment.videoError;
      } catch (error) {
        videoError = error instanceof Error ? error.message : "Video could not be attached.";
        console.error(`Could not attach video to imported activity ${importedActivity.id}:`, error);
      }
    } else if (uploadedVideo) {
      await rm(uploadedVideo.path, { force: true });
    }
    return { activity: attachVideoUrls(importedActivity), inserted: persisted.inserted, ...(videoError ? { videoError } : {}) };
  } finally {
    await rm(fit.path, { force: true });
  }
};

const renderAttachedVideo = async (activity: PersistedActivity, events: MappedGameEvent[]): Promise<void> => {
  const video = activity.video;
  if (!video) return;
  const mediaDirectory = activityMediaDirectory(activity.id, video.mediaId);
  try {
    if (video.sourceDuration === undefined) throw new UserInputError("Video has no source duration.");
    const hudTimeline: HudTimeline | undefined = config.hudEnabled && !config.showLegacyCoinOverlay
      ? await loadHudTimeline(path.join(mediaDirectory, "hud-timeline.json"))
      : undefined;
    const outputPath = path.join(mediaDirectory, "highlights.mp4");
    const render = await renderSelectedClips(
      path.join(mediaDirectory, "source.mp4"), outputPath, events, video.sourceDuration, mediaDirectory,
      config.processTimeoutMs, hudTimeline
    );
    await activityRepository.updateActivityVideo(activity.id, {
      ...video, state: "succeeded", selectedSourceIds: events.map((event) => event.sourceId), render
    }, undefined, outputPath);
    await activityRepository.markActivityHasVideo(activity.id);
  } catch (error) {
    await activityRepository.updateActivityVideo(activity.id, {
      ...video, state: "render_failed", error: error instanceof Error ? error.message : "Unexpected highlight rendering failure."
    });
    console.error(`Activity video ${video.mediaId} rendering failed:`, error);
  } finally {
    busy = false;
  }
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

await Promise.all([mkdir(config.dataDir, { recursive: true }), mkdir(config.mediaDir, { recursive: true })]);
await cleanExpiredJobs();
setInterval(() => void cleanExpiredJobs(), Math.min(config.jobTtlMs, 60_000)).unref();

const app = express();
app.get("/shared/progression.js", (_request, response) => {
  response.sendFile(path.resolve("dist/progression.js"));
});
app.use(express.static(path.resolve("public")));
app.use(express.json({ limit: "16kb" }));

app.post(
  "/api/activities/import",
  importUpload.fields([{ name: "fit", maxCount: 1 }, { name: "video", maxCount: 1 }]),
  async (request, response, next) => {
    const files = request.files as Record<string, Express.Multer.File[]> | undefined;
    const fit = files?.fit?.[0];
    const video = files?.video?.[0];
    const importKey = request.header("Idempotency-Key");
    if (!fit) {
      response.status(400).json({ error: "One FIT file is required." });
      return;
    }
    if (!importKey || !/^[a-zA-Z0-9-]{16,128}$/.test(importKey)) {
      await Promise.all([rm(fit.path, { force: true }), video ? rm(video.path, { force: true }) : Promise.resolve()]);
      response.status(400).json({ error: "A valid Idempotency-Key is required for activity import." });
      return;
    }
    try {
      response.status(201).json(await importActivity(importKey, fit, video));
    } catch (error) {
      await Promise.all([rm(fit.path, { force: true }), video ? rm(video.path, { force: true }) : Promise.resolve()]);
      next(error);
    }
  }
);

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
    void processDetection(request.jobDir, request.job, Boolean(files.video?.[0]), activityRepository);
    response.status(202).json({ token: request.job.token });
    next();
  }
);

app.post("/api/activities/:id/video", lateVideoUpload.single("video"), async (request, response, next) => {
  const uploaded = request.file;
  try {
    if (!uploaded) throw new UserInputError("One video file is required.");
    if (busy) {
      response.status(429).json({ error: "The renderer is busy. Try again after the current job finishes." });
      await rm(uploaded.path, { force: true });
      return;
    }
    const activity = await activityRepository.getActivity(String(request.params.id));
    if (!activity) {
      await rm(uploaded.path, { force: true });
      response.status(404).json({ error: "Activity not found." });
      return;
    }
    if (activity.video) {
      await rm(uploaded.path, { force: true });
      response.status(409).json({ error: "A video is already attached to this ride. Replacing it is not supported." });
      return;
    }
    const mediaId = randomUUID();
    const directory = activityMediaDirectory(activity.id, mediaId);
    const sourcePath = path.join(directory, "source.mp4");
    await mkdir(directory, { recursive: true });
    await rename(uploaded.path, sourcePath);
    const video = await activityRepository.createActivityVideo(activity.id, mediaId, uploaded.originalname, sourcePath);
    busy = true;
    void processAttachedVideo({ ...activity, video }, mediaId, directory);
    response.status(202).json({ activityId: activity.id, video: { ...video, state: "syncing" } });
  } catch (error) {
    if (uploaded) await rm(uploaded.path, { force: true });
    if (error instanceof Error && error.message === "A video is already attached to this ride. Replacing it is not supported.") {
      response.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
});

app.get("/api/activities", async (_request, response, next) => {
  try {
    response.json(await activityRepository.listActivities());
  } catch (error) {
    next(error);
  }
});

app.get("/api/world", async (_request, response, next) => {
  try {
    const [collectibles, discoveredSourceIds] = await Promise.all([
      readCollectibles(config.coinsFile),
      activityRepository.listDiscoveredCollectibleSourceIds()
    ]);
    response.json(createWorldSnapshot(collectibles, discoveredSourceIds));
  } catch (error) {
    next(error);
  }
});

app.get("/api/activities/:id", async (request, response, next) => {
  try {
    const activity = await activityRepository.getActivity(String(request.params.id));
    if (!activity) {
      response.status(404).json({ error: "Activity not found." });
      return;
    }
    response.json(attachVideoUrls(activity));
  } catch (error) {
    next(error);
  }
});

app.post("/api/activities/:id/video/render", async (request, response) => {
  try {
    const activity = await activityRepository.getActivity(String(request.params.id));
    if (!activity?.video) {
      response.status(404).json({ error: "Activity video not found." });
      return;
    }
    if (activity.video.state !== "awaiting_selection") {
      response.status(409).json({ error: "This video is not ready for highlight selection." });
      return;
    }
    if (busy) {
      response.status(429).json({ error: "The renderer is busy. Try again after the current job finishes." });
      return;
    }
    const events = selectedMappedEvents(activity.video.events, request.body?.sourceIds);
    if (activity.video.sourceDuration === undefined) throw new UserInputError("Video has no source duration.");
    const totalDuration = buildClipIntervals(events, activity.video.sourceDuration).reduce(
      (total, interval) => total + interval.end - interval.start, 0
    );
    if (totalDuration > config.maxOutputDurationSeconds) {
      throw new UserInputError(`Selected clips exceed the ${config.maxOutputDurationSeconds}-second output limit.`);
    }
    busy = true;
    const video = { ...activity.video, state: "rendering" as const, selectedSourceIds: events.map((event) => event.sourceId) };
    await activityRepository.updateActivityVideo(activity.id, video);
    void renderAttachedVideo({ ...activity, video }, events);
    response.status(202).json({ activityId: activity.id, video });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not render selected clips.";
    response.status(error instanceof UserInputError ? 400 : 500).json({ error: message });
  }
});

app.get("/api/activities/:id/video/preview", async (request, response) => {
  try {
    const paths = await activityRepository.getActivityVideoPaths(String(request.params.id));
    if (!paths?.outputPath) {
      response.status(409).json({ error: "Highlights are not ready." });
      return;
    }
    await access(paths.outputPath);
    response.sendFile(path.resolve(paths.outputPath));
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Video unavailable." });
  }
});

app.get("/api/activities/:id/video/download", async (request, response) => {
  try {
    const paths = await activityRepository.getActivityVideoPaths(String(request.params.id));
    if (!paths?.outputPath) {
      response.status(409).json({ error: "Highlights are not ready." });
      return;
    }
    await access(paths.outputPath);
    response.download(paths.outputPath, "trailhunt-highlights.mp4");
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : "Video unavailable." });
  }
});

app.get("/api/player/progress", async (_request, response, next) => {
  try {
    response.json(await activityRepository.getProgress());
  } catch (error) {
    next(error);
  }
});

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
      world: job.world,
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
    const events = selectedEvents(job, request.body?.sourceIds ?? request.body?.coinIds);
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
    void renderSelection(directory, job, events, activityRepository);
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
  const isInputError = error instanceof multer.MulterError || error instanceof UserInputError;
  response.status(isInputError ? 400 : 500).json({
    error: error instanceof multer.MulterError ? `Upload rejected: ${error.message}` : error.message
  });
});

app.listen(config.port, () => {
  console.log(`Post-ride AR POC listening on port ${config.port}`);
});
