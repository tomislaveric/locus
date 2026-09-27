import { describe, expect, it } from "vitest";
import { homeViewModel } from "./home-page.js";

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
});
