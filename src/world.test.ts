import { describe, expect, it } from "vitest";
import { createWorldSnapshot } from "./world.js";

const collectible = (id: string, rarity?: "common" | "rare" | "epic") => ({
  id,
  name: id,
  type: "coin" as const,
  latitude: 49,
  longitude: 8,
  radiusMeters: 15,
  value: 10,
  ...(rarity === undefined ? {} : { rarity })
});

describe("World snapshot", () => {
  it("uses catalog membership and distinct persisted source IDs to derive discovery statistics", () => {
    const snapshot = createWorldSnapshot(
      [collectible("common", "common"), collectible("rare", "rare"), collectible("epic", "epic")],
      ["rare", "rare", "removed-from-catalog", "epic"]
    );

    expect(snapshot.collectibles.map((item) => [item.id, item.found, item.visibility])).toEqual([
      ["common", false, "visible"],
      ["rare", true, "visible"],
      ["epic", true, "visible"]
    ]);
    expect(snapshot.stats).toEqual({
      totalCollectibles: 3,
      discoveredCount: 2,
      rareFinds: 1,
      epicFinds: 1,
      remainingCount: 1
    });
  });

  it("supports an empty catalog without inventing a denominator", () => {
    expect(createWorldSnapshot([], ["historical-item"])).toEqual({
      collectibles: [],
      stats: {
        totalCollectibles: 0,
        discoveredCount: 0,
        rareFinds: 0,
        epicFinds: 0,
        remainingCount: 0
      }
    });
  });

  it("accepts a future player-specific visibility result without changing discovery truth", () => {
    const snapshot = createWorldSnapshot(
      [collectible("unexplored", "rare"), collectible("found", "epic")],
      ["found"],
      new Map([["unexplored", "hidden"]])
    );

    expect(snapshot.collectibles).toMatchObject([
      { id: "unexplored", found: false, visibility: "hidden" },
      { id: "found", found: true, visibility: "visible" }
    ]);
    expect(snapshot.stats).toMatchObject({ discoveredCount: 1, rareFinds: 0, epicFinds: 1 });
  });
});
