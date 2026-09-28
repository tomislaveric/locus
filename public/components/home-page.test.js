import { describe, expect, it } from "vitest";
import { HomeLastRide, homeViewModel } from "./home-page.js";

describe("Home data transformation", () => {
  const progress = { totalXp: 700, level: 4, currentLevelXp: 100, nextLevelXp: 400, progressToNextLevel: .25 };
  const activities = [{
    id: "latest", distanceMeters: 5_400, durationSeconds: 1200, xpEarned: 40, collectedCount: 2,
    events: [{ collectible: { rarity: "rare" } }, { collectible: { rarity: "epic" } }]
  }, {
    id: "older", distanceMeters: 600, xpEarned: 10, collectedCount: 1,
    events: [{ collectible: { rarity: "rare" } }]
  }];

  it("derives Home totals from persisted activity history", () => {
    expect(homeViewModel(progress, activities)).toMatchObject({
      progress: { remainingXp: 300 },
      stats: { totalXp: 700, distanceMeters: 6_000, totalCollected: 3, rareFinds: 2 },
      latest: activities[0]
    });
  });

  it("includes a static route preview when the latest ride has replay data", () => {
    const activity = {
      ...activities[0],
      startedAt: "2026-09-26T09:00:00.000Z",
      replay: {
        activity: {
          route: [{ latitude: 48, longitude: 11, timestampMs: 0 }, { latitude: 48.1, longitude: 11.1, timestampMs: 1_000 }]
        },
        activityResult: { collectibles: [], events: [] }
      }
    };

    expect(HomeLastRide(activity)).toContain('class="ride-replay home-ride-replay"');
    expect(HomeLastRide(activity)).not.toContain("ride-replay-play");
    expect(HomeLastRide(activity)).toContain('data-activity-id="latest"');
  });
});
