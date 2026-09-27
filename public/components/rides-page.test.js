import { describe, expect, it } from "vitest";
import { formatRideDate, formatRideDuration, ridesViewModel } from "./rides-page.js";

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
});
