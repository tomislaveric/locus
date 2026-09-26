import { describe, expect, it } from "vitest";
import { interpolatePosition, replayCollectibles, replayDurationSeconds } from "./replay.js";

describe("activity replay", () => {
  it.each([
    [20 * 60, 12],
    [45 * 60, 22.5],
    [60 * 60, 30],
    [5 * 60, 12]
  ])("clamps a %i-second ride to %s replay seconds", (activityDuration, expected) => {
    expect(replayDurationSeconds(activityDuration)).toBe(expected);
  });

  it("interpolates the rider by FIT timestamp", () => {
    expect(interpolatePosition([
      { latitude: 0, longitude: 0, timestampMs: 1_000 },
      { latitude: 10, longitude: 20, timestampMs: 3_000 }
    ], 2_000)).toEqual({ latitude: 5, longitude: 10, timestampMs: 2_000 });
  });

  it("renders only the server-provided collectible subset", () => {
    const near = { id: "near" };
    const omittedFarAway = { id: "far-away" };

    expect(replayCollectibles({ collectibles: [near] })).toEqual([near]);
    expect(replayCollectibles({ collectibles: [near] })).not.toContain(omittedFarAway);
  });
});
