import { describe, expect, it } from "vitest";
import { buildClipIntervals } from "./video.js";

describe("buildClipIntervals", () => {
  it("clamps windows before merging overlapping passages", () => {
    const intervals = buildClipIntervals(
      [
        { coinId: "start", value: 100, latitude: 0, longitude: 0, videoSecond: 0.5 },
        { coinId: "overlap", value: 200, latitude: 0, longitude: 0, videoSecond: 4 },
        { coinId: "separate", value: 300, latitude: 0, longitude: 0, videoSecond: 15 }
      ],
      20
    );

    expect(intervals).toHaveLength(2);
    expect(intervals[0]).toMatchObject({ start: 0, end: 7, passages: [{ coinId: "start" }, { coinId: "overlap" }] });
    expect(intervals[1]).toMatchObject({ start: 12, end: 18, passages: [{ coinId: "separate" }] });
  });
});
