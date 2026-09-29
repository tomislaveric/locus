import { describe, expect, it } from "vitest";
import { activityCollectibleSources, replayTimestamp, traveledCoordinates } from "./activity-replay-map.js";

const route = [
  { longitude: 0, latitude: 0, timestampMs: 1_000 },
  { longitude: 10, latitude: 20, timestampMs: 3_000 }
];

describe("replayTimestamp", () => {
  it("maps playback progress onto the activity's absolute time and clamps to the range", () => {
    const activity = { startedAt: 1_000, endedAt: 3_000 };

    expect(replayTimestamp(activity, 0)).toBe(1_000);
    expect(replayTimestamp(activity, 0.5)).toBe(2_000);
    expect(replayTimestamp(activity, 1)).toBe(3_000);
    expect(replayTimestamp(activity, 1.5)).toBe(3_000);
    expect(replayTimestamp(activity, -1)).toBe(1_000);
  });
});

describe("traveledCoordinates", () => {
  it("includes only passed points plus the interpolated current head so the line reaches the rider", () => {
    const coordinates = traveledCoordinates(route, 2_000);

    expect(coordinates[0]).toEqual([0, 0]);
    expect(coordinates.at(-1)).toEqual([5, 10]);
  });

  it("covers the whole route once playback has finished", () => {
    expect(traveledCoordinates(route, 3_000)).toEqual([[0, 0], [10, 20], [10, 20]]);
  });
});

describe("activityCollectibleSources", () => {
  const sources = [{ id: "c1", longitude: 0, latitude: 0 }];
  const events = [{ sourceId: "c1", activityTimestamp: 1_000 }];

  it("marks a collectible collected only after the historical event's feedback window", () => {
    const [pending] = activityCollectibleSources(sources, events, 1_200);
    const [collected] = activityCollectibleSources(sources, events, 3_000);

    expect(pending.activityCollected).toBe(false);
    expect(pending.activityPending).toBe(true);
    expect(collected.activityCollected).toBe(true);
    expect(collected.activityPending).toBe(false);
  });

  it("never claims global discovery so it cannot alter World visited state", () => {
    const [decorated] = activityCollectibleSources([{ id: "c1", found: true }], events, 3_000);

    expect(decorated.found).toBe(false);
  });
});
