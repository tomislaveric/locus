import { canonicalRarity } from "../collected-list.js";

export const DEFAULT_COLLECTIBLE_CATEGORY = "coin";
export const DEFAULT_COLLECTIBLE_RARITY = "common";

export const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };

/**
 * Converts a World collectible into a canonical GeoJSON point feature. Coordinates stay
 * geographic so MapLibre owns every projection; Staza state travels as properties only.
 */
export const collectibleFeature = (collectible, selectedId, questCollectibleIds) => ({
  type: "Feature",
  id: collectible.id,
  geometry: {
    type: "Point",
    coordinates: [collectible.longitude, collectible.latitude]
  },
  properties: {
    id: collectible.id,
    name: collectible.name ?? collectible.id,
    category: collectible.type ?? DEFAULT_COLLECTIBLE_CATEGORY,
    rarity: canonicalRarity(collectible.rarity) ?? DEFAULT_COLLECTIBLE_RARITY,
    visited: Boolean(collectible.found),
    selected: collectible.id === selectedId,
    questRelated: !questCollectibleIds || questCollectibleIds.has(collectible.id)
  }
});

/**
 * @param {object} [options]
 * @param {string} [options.selectedId]
 * @param {Iterable<string>} [options.questCollectibleIds] Ids of the active quest's
 *   collectibles. Presentational only: when omitted every feature counts as quest
 *   related, which keeps the default marker hierarchy unchanged.
 */
export const collectiblesToFeatureCollection = (collectibles, { selectedId, questCollectibleIds } = {}) => {
  const questIds = questCollectibleIds ? new Set(questCollectibleIds) : undefined;
  return {
    type: "FeatureCollection",
    features: collectibles.map((collectible) => collectibleFeature(collectible, selectedId, questIds))
  };
};
