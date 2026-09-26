import { describe, expect, it } from "vitest";
import { buildClipIntervals, buildHudSegmentFilter, buildSegmentFilter, planCoinEffect } from "./video.js";

describe("buildClipIntervals", () => {
  it("clamps windows before merging overlapping passages", () => {
    const intervals = buildClipIntervals(
      [
        { id: "start", type: "coin", value: 100, latitude: 0, longitude: 0, activityTimestamp: 500, videoSecond: 0.5 },
        { id: "overlap", type: "coin", value: 200, latitude: 0, longitude: 0, activityTimestamp: 4_000, videoSecond: 4 },
        { id: "separate", type: "coin", value: 300, latitude: 0, longitude: 0, activityTimestamp: 15_000, videoSecond: 15 }
      ],
      20
    );

    expect(intervals).toHaveLength(2);
    expect(intervals[0]).toMatchObject({ start: 0, end: 7, events: [{ id: "start" }, { id: "overlap" }] });
    expect(intervals[1]).toMatchObject({ start: 12, end: 18, events: [{ id: "separate" }] });
  });

  describe("HUD segment planning", () => {
    it("overlays compact HUD layers while preserving source audio", () => {
      const plan = buildHudSegmentFilter(6, true, { map: true, feed: true });
      expect(plan.filter).toContain("overlay=W-w-24:H-h-24");
      expect(plan.filter).toContain("overlay=W-w-24:24");
      expect(plan.filter).toContain("[0:a]atrim=duration=6.000");
      expect(plan.filter).not.toContain("amix=");
      expect(plan.videoOutput).toBe("[hud-feed]");
    });

    it("keeps a no-overlay plan when both visual features are disabled", () => {
      const plan = buildHudSegmentFilter(6, false, { map: false, feed: false });
      expect(plan.videoOutput).toBe("[base]");
      expect(plan.filter).toContain("anullsrc=r=48000:cl=stereo");
      expect(plan.filter).not.toContain("overlay=");
    });
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
        events: [
          { id: "one", type: "coin", value: 123, latitude: 0, longitude: 0, activityTimestamp: 12_000, videoSecond: 12 },
          { id: "two", type: "coin", value: 456, latitude: 0, longitude: 0, activityTimestamp: 12_100, videoSecond: 12.1 }
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
