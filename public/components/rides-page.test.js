import { describe, expect, it } from "vitest";
import { RideCard, formatRideDate, formatRideDuration, ridesViewModel } from "./rides-page.js";

describe("Rides data transformation", () => {
  const activities = [
    {
      id: "newest", startedAt: "2026-09-26T12:00:00.000Z", distanceMeters: 5_400,
      durationSeconds: 3_960, xpEarned: 40, collectedCount: 2, hasVideo: true
    },
    {
      id: "older", startedAt: "2026-09-25T12:00:00.000Z",
      xpEarned: 10, collectedCount: 1, hasVideo: false
    }
  ];

  it("preserves repository ordering while deriving compact history totals", () => {
    expect(ridesViewModel(activities)).toMatchObject({
      activities,
      stats: { count: 2, distanceMeters: 5_400, xp: 50, collected: 3 }
    });
  });

  it("formats persisted ride metadata and missing values explicitly", () => {
    expect(formatRideDate(activities[0].startedAt)).toBe("SAT, SEP 26");
    expect(formatRideDuration(activities[0].durationSeconds)).toBe("1h 6m");
    expect(formatRideDuration(undefined)).toBe("Duration unavailable");
  });

  it("shows the static route preview and collectible dots for a detailed ride", () => {
    const activity = {
      ...activities[0],
      events: [{ sourceId: "castle", collectible: { name: "Castle Gate", rarity: "rare" } }],
      replay: {
        activity: {
          route: [{ latitude: 48, longitude: 11, timestampMs: 0 }, { latitude: 48.1, longitude: 11.1, timestampMs: 1_000 }]
        },
        activityResult: { collectibles: [], events: [] }
      }
    };

    expect(RideCard(activity)).toContain('class="ride-replay ride-card-replay"');
    expect(RideCard(activity)).toContain('class="rarity-rare"');
    expect(RideCard(activity)).not.toContain("Castle Gate");
    expect(RideCard(activity)).not.toContain("ride-found");
  });
});
