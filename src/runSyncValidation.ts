import path from "node:path";
import {
  discoverSyncFixtures,
  fixtureFailureResults,
  loadSyncFixture,
  mediaAvailable,
  validateSyncFixture,
  type SyncEventResult
} from "./syncValidation.js";

const fixtureDirectory = path.resolve("fixtures/sync");
const mediaDirectory = path.resolve(process.env.SYNC_FIXTURE_ROOT ?? fixtureDirectory);
const timeoutMs = Number(process.env.SYNC_VALIDATION_TIMEOUT_MS ?? 15 * 60 * 1000);
const debug = process.argv.includes("--debug");

const format = (value: number | undefined): string => value === undefined ? "n/a" : value.toFixed(3);

const diagnostic = (result: SyncEventResult): string =>
  [
    `source=${result.sourceId}`,
    `video-start=${result.videoStartUtc ?? "unavailable"}`,
    `fit-event=${result.fitEventUtc ?? "unavailable"}`,
    `computed=${format(result.actualVideoSecond)}`,
    `expected=${format(result.expectedVideoSecond)}`,
    `error=${format(result.absoluteErrorSeconds)}`
  ].join(" ");

const main = async (): Promise<void> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("SYNC_VALIDATION_TIMEOUT_MS must be a positive number.");
  const fixturePaths = await discoverSyncFixtures(fixtureDirectory);
  if (!fixturePaths.length) throw new Error(`No synchronization fixtures found in ${fixtureDirectory}.`);
  const failures: string[] = [];
  const errors: number[] = [];
  let passed = 0;
  let skipped = 0;
  for (const fixturePath of fixturePaths) {
    const fixture = await loadSyncFixture(fixturePath);
    const fit = path.resolve(mediaDirectory, fixture.fit);
    const video = path.resolve(mediaDirectory, fixture.video);
    if (!(await mediaAvailable(fit)) || !(await mediaAvailable(video))) {
      skipped += 1;
      console.log(`Ride: ${fixture.name} SKIPPED missing media (root: ${mediaDirectory})`);
      continue;
    }
    console.log(`Ride: ${fixture.name}`);
    let events: SyncEventResult[];
    try {
      const result = await validateSyncFixture(fixture, mediaDirectory, timeoutMs);
      events = result.events;
      if (debug) console.log(`  synchronization=${JSON.stringify(result.synchronization)}`);
    } catch (error) {
      events = fixtureFailureResults(fixture, error);
    }
    for (const event of events) {
      console.log(`${event.coinId} expected ${format(event.expectedVideoSecond)} actual ${format(event.actualVideoSecond)} error ${format(event.absoluteErrorSeconds)} ${event.passed ? "PASS" : "FAIL"}`);
      if (event.absoluteErrorSeconds !== undefined) errors.push(event.absoluteErrorSeconds);
      if (event.passed) passed += 1;
      else failures.push(`${fixture.name}/${event.coinId}: ${event.diagnostic ?? diagnostic(event)}`);
      if (!event.passed || debug) console.log(`  ${diagnostic(event)}${event.diagnostic ? ` detail=${event.diagnostic}` : ""}`);
    }
  }
  const sortedErrors = [...errors].sort((left, right) => left - right);
  const mean = errors.length ? errors.reduce((sum, error) => sum + error, 0) / errors.length : undefined;
  const median = sortedErrors.length ? sortedErrors[Math.floor(sortedErrors.length / 2)] : undefined;
  const p95 = sortedErrors.length >= 20 ? sortedErrors[Math.ceil(sortedErrors.length * 0.95) - 1] : undefined;
  console.log(`Summary: events=${passed + failures.length} passed=${passed} failed=${failures.length} skipped=${skipped} mean-absolute-error=${format(mean)} median-absolute-error=${format(median)} max-absolute-error=${format(sortedErrors.at(-1))}${p95 === undefined ? "" : ` p95=${format(p95)}`}`);
  if (failures.length) throw new Error(`Synchronization validation failed:\n${failures.join("\n")}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
