import { describe, expect, it } from "vitest";
import type { SyncFixture, SyncValidationDependencies } from "./syncValidation.js";
import { fixtureFailureResults, validateSyncFixture } from "./syncValidation.js";

const fixture: SyncFixture = {
  name: "test-ride",
  fit: "track.fit",
  video: "ride.mp4",
  coins: [{ id: "coin-a", latitude: 0, longitude: 0, radius_m: 5, value: 100 }],
  events: [{ coinId: "coin-a", expectedVideoSecond: 10.5 }]
};

const dependencies = (actualVideoSecond: number): SyncValidationDependencies => ({
  parseFitTrack: async () => [{ latitude: 0, longitude: 0, timestampMs: 1_010_500 }],
  detectCoinPassage: () => 1_010_500,
  gpmfStreamIndex: async () => 2,
  extractGps5Times: async () => [{ timestampMs: 1_000_000, videoSeconds: 0 }],
  probeDuration: async () => 20,
  mapToVideoSecond: () => actualVideoSecond,
  videoStartMilliseconds: () => 1_000_000
});

describe("validateSyncFixture", () => {
  it("retains expected, actual, error, tolerance, and UTC diagnostics", async () => {
    const result = await validateSyncFixture(fixture, "/media", 1_000, dependencies(10.75));
    expect(result.events).toEqual([
      expect.objectContaining({
        sourceId: "test-ride",
        coinId: "coin-a",
        expectedVideoSecond: 10.5,
        actualVideoSecond: 10.75,
        absoluteErrorSeconds: 0.25,
        toleranceSeconds: 1.5,
        passed: true,
        videoStartUtc: "1970-01-01T00:16:40.000Z",
        fitEventUtc: "1970-01-01T00:16:50.500Z"
      })
    ]);
  });

  it("fails an event mapped outside the actual video duration", async () => {
    const result = await validateSyncFixture(fixture, "/media", 1_000, dependencies(21));
    expect(result.events[0]).toMatchObject({
      passed: false,
      diagnostic: "Mapped event is outside the 20.000 second video duration."
    });
  });

  it("fails all fixture events when the derived video start differs from its expected UTC", async () => {
    const result = await validateSyncFixture(
      { ...fixture, expectedVideoStartUtc: "1970-01-01T00:00:00.000Z" },
      "/media",
      1_000,
      dependencies(10.5)
    );
    expect(result.events[0]).toMatchObject({
      passed: false,
      diagnostic: "Video start differs from expected 1970-01-01T00:00:00.000Z by 1000.000 seconds."
    });
  });

  it("turns fixture processing errors into source-scoped failed events", () => {
    expect(fixtureFailureResults(fixture, new Error("GPS5 stream is corrupt"))).toEqual([
      expect.objectContaining({
        sourceId: "test-ride",
        coinId: "coin-a",
        expectedVideoSecond: 10.5,
        passed: false,
        diagnostic: "Fixture validation failed: GPS5 stream is corrupt"
      })
    ]);
  });
});
