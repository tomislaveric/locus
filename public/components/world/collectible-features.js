import { canonicalRarity } from "../collected-list.js";

export const DEFAULT_COLLECTIBLE_CATEGORY = "coin";
export const DEFAULT_COLLECTIBLE_RARITY = "common";

export const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };

/**
 * Converts a World collectible into a canonical GeoJSON point feature. Coordinates stay
 * geographic so MapLibre owns every projection; Staza state travels as properties only.
 */
export const collectibleFeature = (collectible, selectedId) => ({
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
    selected: collectible.id === selectedId
  }
});

export const collectiblesToFeatureCollection = (collectibles, { selectedId } = {}) => ({
  type: "FeatureCollection",
  features: collectibles.map((collectible) => collectibleFeature(collectible, selectedId))
});
