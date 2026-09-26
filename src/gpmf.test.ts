import { describe, expect, it } from "vitest";
import { mapToVideoSecond, selectGps5Times, videoStartMilliseconds } from "./gpmf.js";
import { SynchronizationError } from "./synchronization.js";

const samples = [
  { timestampMs: 1_000_000, videoSeconds: 0 },
  { timestampMs: 1_010_000, videoSeconds: 10 },
  { timestampMs: 1_020_000, videoSeconds: 20 }
];

describe("GPS5 timestamp mapping", () => {
  it("maps the video start and preserves sub-second precision", () => {
    expect(videoStartMilliseconds(samples)).toBe(1_000_000);
    expect(mapToVideoSecond(1_000_000, samples)).toBe(0);
    expect(mapToVideoSecond(1_010_125, samples)).toBe(10.125);
  });

  describe("GPS5 clock selection", () => {
    it("selects a valid stable candidate cluster and rejects placeholders", () => {
      const start = Date.parse("2026-01-01T00:00:00.000Z");
      const selected = selectGps5Times([
        ...Array.from({ length: 25 }, (_, index) => ({ date: new Date(start + index * 1_000), cts: index * 1_000 })),
        ...Array.from({ length: 25 }, (_, index) => ({ date: "0000-00-00T00:00:00Z", cts: index * 1_000 }))
      ]);
      expect(videoStartMilliseconds(selected)).toBe(start);
    });

    it("returns a typed error when no plausible GPS5 clock exists", () => {
      try {
        selectGps5Times(Array.from({ length: 20 }, (_, index) => ({
          date: "0000-00-00T00:00:00Z",
          cts: index * 1_000
        })));
        throw new Error("Expected selectGps5Times to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(SynchronizationError);
        expect((error as SynchronizationError).code).toBe("NO_VALID_VIDEO_CLOCK");
      }
    });
  });

  it("maps timestamps before and after video start without clamping", () => {
    expect(mapToVideoSecond(999_000, samples)).toBe(-1);
    expect(mapToVideoSecond(1_030_000, samples)).toBe(30);
  });
});
