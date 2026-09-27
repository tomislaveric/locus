import { describe, expect, it } from "vitest";
import { CollectedTab, collectedRouteTimeline } from "./collected-tab.js";
import { CollectibleCard, CollectedList, collectedEvents } from "./collected-list.js";

const event = (id, rarity) => ({
  id,
  sourceId: id,
  type: "collectible_collected",
  collectible: { name: `Item ${id}`, type: "coin", ...(rarity === undefined ? {} : { rarity }) },
  value: 25,
  latitude: 48.1,
  longitude: 11.5,
  activityTimestamp: 1_000
});

describe("Collected tab", () => {
  it("renders persisted collectible events in supplied order with canonical rarities only", () => {
    const activity = { events: [event("first", "rare"), event("second", undefined), event("third", "invalid")] };
    const view = CollectedList(activity);
    expect(collectedEvents(activity).map(({ id }) => id)).toEqual(["first", "second", "third"]);
    expect(view.indexOf("Item first")).toBeLessThan(view.indexOf("Item second"));
    expect(view).toContain("rarity-rare");
    expect(view).not.toContain("rarity-invalid");
    expect(view).toContain("+25 XP");
    expect(CollectibleCard({ ...event("tower", "epic"), collectible: { name: "Tower", type: "landmark", rarity: "epic" } })).toContain("collectible-landmark-epic.svg");
  });

  it("renders a factual empty state without collectible cards", () => {
    const view = CollectedList({ events: [] });
    expect(view).toContain("NO COLLECTIBLES FOUND");
    expect(view).not.toContain("collectible-card");
  });

  it("renders a historical timeline only with a complete route", () => {
    const activity = { events: [event("one", "epic")] };
    const replay = { activity: { route: [{ latitude: 48, longitude: 11, timestampMs: 0 }, { latitude: 48.2, longitude: 11.7, timestampMs: 2_000 }] } };
    expect(collectedRouteTimeline(activity, replay)).toContain("Historical route");
    expect(collectedRouteTimeline(activity, undefined)).toBe("");
    expect(CollectedTab(activity, replay)).toContain("collected-route");
  });
});
