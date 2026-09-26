import { describe, expect, it } from "vitest";
import { deriveActivity, deriveActivityResult } from "./activity.js";

const route = [
  { latitude: 0, longitude: 0, timestampMs: 1_000 },
  { latitude: 0, longitude: 0.001, timestampMs: 61_000 },
  { latitude: 0, longitude: 0.002, timestampMs: 121_000 }
];

describe("activity derivation", () => {
  it("derives route measurements and canonical timestamp-ordered events", () => {
    const activity = deriveActivity("ride", route);
    const result = deriveActivityResult(activity, [
      { id: "later", name: "Later", type: "landmark", latitude: 0, longitude: 0.00195, radiusMeters: 10, value: 20 },
      { id: "first", name: "First", type: "coin", latitude: 0, longitude: 0.00095, radiusMeters: 10, value: 10 }
    ]);

    expect(activity).toMatchObject({ id: "ride", source: "fit", startedAt: 1_000, endedAt: 121_000, duration: 120 });
    expect(activity.distance).toBeGreaterThan(200);
    expect(result).toMatchObject({ activityId: "ride", collectedCount: 2, totalPoints: 30 });
    expect(result.events.map((event) => event.sourceId)).toEqual(["first", "later"]);
    expect(result.events.map((event) => event.collectible.name)).toEqual(["First", "Later"]);
    expect(result.events.every((event) => event.videoSecond === undefined)).toBe(true);
  });

  it("completes a zero-collectible activity", () => {
    const result = deriveActivityResult(deriveActivity("ride", route), []);
    expect(result).toMatchObject({ collectedCount: 0, totalPoints: 0, events: [] });
  });
});
