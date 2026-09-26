import { describe, expect, it } from "vitest";
import { mapToVideoSecond, videoStartMilliseconds } from "./gpmf.js";

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

  it("maps timestamps before and after video start without clamping", () => {
    expect(mapToVideoSecond(999_000, samples)).toBe(-1);
    expect(mapToVideoSecond(1_030_000, samples)).toBe(30);
  });
});
