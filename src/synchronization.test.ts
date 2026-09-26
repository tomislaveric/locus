import { describe, expect, it } from "vitest";
import { assessSynchronization, synchronizationFailure, withEventAvailability } from "./synchronization.js";

const samples = [
  { timestampMs: Date.parse("2026-01-01T23:59:50.000Z"), videoSeconds: 0 },
  { timestampMs: Date.parse("2026-01-02T00:00:10.000Z"), videoSeconds: 20 }
];

describe("synchronization assessment", () => {
  it("uses UTC milliseconds across midnight and classifies out-of-video passages", () => {
    const assessment = assessSynchronization([
      { latitude: 0, longitude: 0, timestampMs: Date.parse("2026-01-02T01:59:55+02:00") },
      { latitude: 0, longitude: 0, timestampMs: Date.parse("2026-01-02T02:00:05+02:00") }
    ], samples, 30, 30);
    expect(assessment.summary.overlapSeconds).toBe(10);
    expect(withEventAvailability(assessment, [
      Date.parse("2026-01-01T23:59:55.000Z"),
      Date.parse("2026-01-02T00:00:30.001Z")
    ])).toMatchObject({ availableEvents: 1, unavailableEvents: 1 });
    expect(assessment.summary).toMatchObject({
      confidence: "low",
      warnings: ["Video extends beyond the available FIT activity time range."]
    });
  });

  it("rejects non-overlapping ranges and warns for threshold FIT gaps", () => {
    expect(() => assessSynchronization([
      { latitude: 0, longitude: 0, timestampMs: 0 },
      { latitude: 0, longitude: 0, timestampMs: 1_000 }
    ], samples, 30, 30)).toThrow("do not overlap");
    const assessment = assessSynchronization([
      { latitude: 0, longitude: 0, timestampMs: samples[0].timestampMs },
      { latitude: 0, longitude: 0, timestampMs: samples[0].timestampMs + 30_000 }
    ], samples, 30, 30);
    expect(assessment.summary.warnings).toContain("FIT samples contain a gap of at least 30 seconds.");
    expect(synchronizationFailure("NO_VALID_VIDEO_CLOCK").code).toBe("NO_VALID_VIDEO_CLOCK");
  });

  it("does not warn when the FIT activity fully covers the video", () => {
    const assessment = assessSynchronization(
      Array.from({ length: 5 }, (_, index) => ({
        latitude: 0,
        longitude: 0,
        timestampMs: samples[0].timestampMs - 1_000 + index * 10_000
      })),
      samples,
      30,
      30
    );
    expect(assessment.summary).toMatchObject({ confidence: "high", warnings: [] });
  });
});
