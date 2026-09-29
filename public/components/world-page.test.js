import { describe, expect, it } from "vitest";
import { filteredWorldCollectibles, visibleWorldCollectibles } from "./world-page.js";

const collectibles = [
  { id: "common-found", found: true, rarity: "common", latitude: 49, longitude: 8 },
  { id: "rare-unfound", found: false, rarity: "rare", latitude: 50, longitude: 9 },
  { id: "epic-found", found: true, rarity: "epic", latitude: 51, longitude: 10 }
];

describe("World page data transformations", () => {
  it("keeps rarity filters independent from player discovery state", () => {
    expect(filteredWorldCollectibles(collectibles, "found").map((item) => item.id)).toEqual(["common-found", "epic-found"]);
    expect(filteredWorldCollectibles(collectibles, "unfound").map((item) => item.id)).toEqual(["rare-unfound"]);
    expect(filteredWorldCollectibles(collectibles, "rare").map((item) => item.id)).toEqual(["rare-unfound"]);
    expect(filteredWorldCollectibles(collectibles, "epic").map((item) => item.id)).toEqual(["epic-found"]);
  });

  it("keeps future hidden markers out of all filter states without changing discovery filters", () => {
    const hidden = {
      id: "epic-hidden",
      found: false,
      rarity: "epic",
      latitude: 52,
      longitude: 11,
      visibility: "hidden"
    };
    const withHidden = [...collectibles, hidden];

    expect(visibleWorldCollectibles(withHidden).map((item) => item.id)).toEqual([
      "common-found", "rare-unfound", "epic-found"
    ]);
    expect(filteredWorldCollectibles(withHidden, "epic").map((item) => item.id)).toEqual(["epic-found"]);
  });
});
