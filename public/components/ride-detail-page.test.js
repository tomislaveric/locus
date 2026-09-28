import { describe, expect, it } from "vitest";
import { nearMissInputs, RideDetailPage, replayInputs } from "./ride-detail-page.js";
import { rideDistanceLabel, rideDurationLabel } from "./ride-summary.js";

const replay = (nearMisses = []) => ({
  version: 1,
  activity: { source: "fit", route: [{}, {}] },
  activityResult: { collectibles: [], events: [], nearMisses }
});

describe("Ride detail data transformation", () => {
  it("uses only a complete versioned replay snapshot", () => {
    const snapshot = replay();
    expect(replayInputs({ replay: snapshot })).toBe(snapshot);
    expect(replayInputs({})).toBeUndefined();
    expect(replayInputs({ replay: { version: 2 } })).toBeUndefined();
    expect(replayInputs({ replay: { ...snapshot, activity: { source: "fit", route: [] } } })).toBeUndefined();
    const invalidNearMiss = replay([{ collectibleId: "bad", name: "Bad", value: 1, rarity: "invalid", minimumDistanceMeters: 10 }]);
    expect(replayInputs({ replay: invalidNearMiss })).toBe(invalidNearMiss);
    expect(nearMissInputs({ replay: invalidNearMiss })).toBeUndefined();
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

  it("renders persisted near misses without XP or current-world fields", () => {
    const page = RideDetailPage({
      distanceMeters: 1_000,
      durationSeconds: 600,
      xpEarned: 25,
      collectedCount: 1,
      replay: replay([
        { collectibleId: "historic-target", name: "Historic Target", value: 100, rarity: "rare", minimumDistanceMeters: 42.4 }
      ])
    }, { level: 1, currentLevelXp: 0, nextLevelXp: 100, progressToNextLevel: 0 }, "near-misses");
    expect(page).toContain("NEAR MISSES (1)");
    expect(page).toContain("Historic Target");
    expect(page).toContain("42 m from your route");
    expect(page).toContain("near-miss-target-rare-a.svg");
    expect(page).not.toContain("+100 XP");
    expect(page).not.toContain("landmark");
  });

  it("renders factual empty and unavailable near-miss states", () => {
    const activity = { distanceMeters: 1_000, durationSeconds: 600, xpEarned: 0, collectedCount: 0 };
    const progress = { level: 1, currentLevelXp: 0, nextLevelXp: 100, progressToNextLevel: 0 };
    expect(RideDetailPage({ ...activity, replay: replay() }, progress, "near-misses")).toContain("NO NEAR MISSES RECORDED");
    expect(RideDetailPage(activity, progress, "near-misses")).toContain("Near-miss data is unavailable for this legacy ride.");
  });

  it("keeps the Video tab functional for a valid FIT-only ride", () => {
    const page = RideDetailPage({
      id: "ride-1", distanceMeters: 1_000, durationSeconds: 600, xpEarned: 25, collectedCount: 1
    }, { level: 1, currentLevelXp: 0, nextLevelXp: 100, progressToNextLevel: 0 }, "video");
    expect(page).toContain('data-ride-tab="video"');
    expect(page).toContain('aria-selected="true"');
    expect(page).toContain("NO VIDEO ATTACHED");
    expect(page).toContain("ATTACH VIDEO");
    expect(page).toContain('data-upload-dropzone');
    expect(page).toContain('name="video"');
  });

  it("uses only persisted video values in the completed Video tab", () => {
    const page = RideDetailPage({
      id: "ride-1", distanceMeters: 1_000, durationSeconds: 600, xpEarned: 25, collectedCount: 1,
      video: {
        state: "succeeded", previewUrl: "/preview", downloadUrl: "/download",
        render: { outputDurationSeconds: 24 }, events: [{
          sourceId: "historic-coin", videoSecond: 6, collectible: { name: "Historic Coin" }
        }]
      }
    }, { level: 1, currentLevelXp: 0, nextLevelXp: 100, progressToNextLevel: 0 }, "video");
    expect(page).toContain("Auto-Generated Highlights");
    expect(page).toContain("Historic Coin");
    expect(page).toContain("/download");
    expect(page).not.toContain("Castle Gate");
  });

  it("renders immediate analysis, selectable highlights, and no-highlight dismissal states", () => {
    const progress = { level: 1, currentLevelXp: 0, nextLevelXp: 100, progressToNextLevel: 0 };
    const base = { id: "ride-1", distanceMeters: 1_000, durationSeconds: 600, xpEarned: 25, collectedCount: 1 };
    const analysing = RideDetailPage({ ...base, video: { state: "uploading" } }, progress, "video");
    const selection = RideDetailPage({
      ...base,
      video: {
        state: "awaiting_selection",
        events: [{ sourceId: "coin-a", collectible: { name: "Coin A", rarity: "rare", type: "coin" }, value: 100 }]
      }
    }, progress, "video");
    const noHighlights = RideDetailPage({ ...base, video: { state: "no_highlights" } }, progress, "video");

    expect(analysing).toContain("Analysing Video");
    expect(analysing).toContain("Reading Video");
    expect(selection).toContain("1 Collectibles Found");
    expect(selection).toContain("Select All");
    expect(selection).toContain("GENERATE HIGHLIGHTS");
    expect(selection).toContain("disabled");
    expect(noHighlights).toContain("NO HIGHLIGHTS FOUND");
    expect(noHighlights).toContain("data-no-highlights-close");
  });

  it("lets an unavailable source video return to the initial upload state", () => {
    const page = RideDetailPage({
      id: "ride-1", distanceMeters: 1_000, durationSeconds: 600, xpEarned: 25, collectedCount: 1,
      video: { state: "sync_failed", error: "The FIT activity and video do not overlap in time." }
    }, { level: 1, currentLevelXp: 0, nextLevelXp: 100, progressToNextLevel: 0 }, "video");
    expect(page).toContain("NO HIGHLIGHTS FOUND");
    expect(page).toContain("TRY AGAIN");
    expect(page).toContain("data-video-retry");
    expect(page).not.toContain("The FIT activity and video do not overlap in time.");
  });
});
