import type { Collectible, WorldCollectibleVisibility, WorldSnapshot } from "./domain.js";

const hasRarity = (collectible: Collectible, rarity: "rare" | "epic"): boolean =>
  collectible.rarity === rarity;

export const createWorldSnapshot = (
  collectibles: Collectible[],
  discoveredSourceIds: Iterable<string>,
  visibilityBySourceId: ReadonlyMap<string, WorldCollectibleVisibility> = new Map()
): WorldSnapshot => {
  const discoveredIds = new Set(discoveredSourceIds);
  const worldCollectibles = collectibles.map((collectible) => ({
    ...collectible,
    found: discoveredIds.has(collectible.id),
    visibility: visibilityBySourceId.get(collectible.id) ?? "visible"
  }));
  const discovered = worldCollectibles.filter((collectible) => collectible.found);

  return {
    collectibles: worldCollectibles,
    stats: {
      totalCollectibles: worldCollectibles.length,
      discoveredCount: discovered.length,
      rareFinds: discovered.filter((collectible) => hasRarity(collectible, "rare")).length,
      epicFinds: discovered.filter((collectible) => hasRarity(collectible, "epic")).length,
      remainingCount: worldCollectibles.length - discovered.length
    }
  };
};
