import { describe, expect, it } from "vitest";
import { RideDetailPage, replayInputs } from "./ride-detail-page.js";
import { rideDistanceLabel, rideDurationLabel } from "./ride-summary.js";

describe("Ride detail data transformation", () => {
  it("uses only a complete versioned replay snapshot", () => {
    const replay = {
      version: 1,
      activity: { source: "fit", route: [{}, {}] },
      activityResult: { collectibles: [], events: [], nearMisses: [] }
    };
    expect(replayInputs({ replay })).toBe(replay);
    expect(replayInputs({})).toBeUndefined();
    expect(replayInputs({ replay: { version: 2 } })).toBeUndefined();
    expect(replayInputs({ replay: { ...replay, activity: { source: "fit", route: [] } } })).toBeUndefined();
  });

  it("formats canonical summary values while making missing values explicit", () => {
    expect(rideDistanceLabel(6_680)).toBe("6.7 KM");
    expect(rideDistanceLabel(undefined)).toBe("DISTANCE UNAVAILABLE");
    expect(rideDurationLabel(9_180)).toBe("2h 33m");
    expect(rideDurationLabel(undefined)).toBe("DURATION UNAVAILABLE");
  });

  it("keeps collected content available when a legacy ride has no replay snapshot", () => {
    const page = RideDetailPage({
      distanceMeters: 1_000,
      durationSeconds: 600,
      xpEarned: 25,
      collectedCount: 1,
      events: [{ type: "collectible_collected", sourceId: "coin-a", collectible: { name: "Coin A", type: "coin" }, value: 25 }]
    }, { level: 1, currentLevelXp: 0, nextLevelXp: 100, progressToNextLevel: 0 }, "collected");
    expect(page).toContain("Coin A");
    expect(page).toContain("COLLECTED (1)");
    expect(page).not.toContain("Replay data is unavailable");
  });
});
