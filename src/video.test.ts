import { describe, expect, it } from "vitest";
import { buildClipIntervals, buildSegmentFilter, planCoinEffect } from "./video.js";

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

describe("Coin effect planning", () => {
  it("clamps the approach and later phases to the clip boundaries", () => {
    expect(planCoinEffect(0.2, 6)).toMatchObject({ approachStart: 0, collectEnd: 0.45, rewardEnd: 1.15 });
    expect(planCoinEffect(5.9, 6)).toMatchObject({ approachStart: 2.9, collectEnd: 6, rewardEnd: 6 });
  });

  it("keeps overlapping effect branches and audio Chimes independent", () => {
    const plan = buildSegmentFilter(
      {
        start: 10,
        end: 16,
        passages: [
          { coinId: "one", value: 123, latitude: 0, longitude: 0, videoSecond: 12 },
          { coinId: "two", value: 456, latitude: 0, longitude: 0, videoSecond: 12.1 }
        ]
      },
      false
    );

    expect(plan.filter).toContain("[approach0]");
    expect(plan.filter).toContain("[approach1]");
    expect(plan.filter).toContain("[chime0]");
    expect(plan.filter).toContain("[chime1]");
    expect(plan.filter).toContain("amix=inputs=3");
    expect(plan.filter).toContain("eof_action=pass:repeatlast=0");
    expect(plan.filter).toContain("1+2*(t-1.000)/1.000");
    expect(plan.filter).toContain("240*(3+0.35*t/0.25)");
    expect(plan.audioOutput).toBe("[aout]");
  });
});
