import { describe, expect, it } from "vitest";
import type { HudTimeline } from "../domain.js";
import { deriveHudState, interpolateRider, projectLocal, rotateHeadingUp } from "./state.js";

const timeline: HudTimeline = {
  version: 1,
  track: [
    { latitude: 48, longitude: 11, videoSecond: 0 },
    { latitude: 48.001, longitude: 11, videoSecond: 10 },
    { latitude: 48.002, longitude: 11, videoSecond: 20 }
  ],
  coins: [
    { id: "first", latitude: 48.0005, longitude: 11, radius_m: 5, value: 100 },
    { id: "second", latitude: 48.0015, longitude: 11, radius_m: 5, value: 200 }
  ],
  events: [
    { coinId: "first", latitude: 48.0005, longitude: 11, value: 100, videoSecond: 5 },
    { coinId: "second", latitude: 48.0015, longitude: 11, value: 200, videoSecond: 15 }
  ]
};

describe("HUD state", () => {
  it("projects and rotates nearby positions into a heading-up local map", () => {
    const origin = timeline.track[0];
    const north = projectLocal(origin, 48.001, 11);
    expect(north.y).toBeGreaterThan(100);
    const rotated = rotateHeadingUp({ x: 10, y: 0 }, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0);
    expect(rotated.y).toBeCloseTo(-10);
  });

  it("interpolates the rider and transitions next item, collection, and feed state", () => {
    expect(interpolateRider(timeline.track, 5).latitude).toBeCloseTo(48.0005);
    const segmentState = deriveHudState(timeline, 5, 150, 4, 3, { start: 0, end: 10 });
    expect(segmentState.riderPoint.y).toBeLessThan(0);
    expect(segmentState.riderDirection.y).toBeLessThan(0);
    const before = deriveHudState(timeline, 4, 150, 4, 3, { start: 0, end: 10 });
    expect(before.next?.event.coinId).toBe("first");
    expect(before.items).toHaveLength(1);
    expect(before.items[0].x).toBeCloseTo(0);

    const after = deriveHudState(timeline, 5.5, 150, 4, 3, { start: 0, end: 10 });
    expect(after.next?.event.coinId).toBe("second");
    expect(after.items).toEqual([]);
    expect(after.feedback?.coinId).toBe("first");
    expect(after.recentEvents.map((event) => event.coinId)).toEqual(["first"]);
  });

  it("caps and expires recent events", () => {
    expect(deriveHudState(timeline, 17.9, 150, 3, 1).recentEvents.map((event) => event.coinId)).toEqual(["second"]);
    expect(deriveHudState(timeline, 20, 150, 3, 3).recentEvents).toEqual([]);
  });
});
