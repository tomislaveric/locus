import { canonicalRarity } from "../collected-list.js";

/**
 * One marker vocabulary shared by the map legend and the quest collectible rows:
 * fill encodes discovery, ring encodes rarity — exactly like the MapLibre circle layers.
 */
export const CollectibleSwatch = ({ visited = false, rarity, selected = false } = {}) => {
  const tier = canonicalRarity(rarity) ?? "common";
  const classes = [
    "collectible-swatch",
    visited ? "is-visited" : "is-unvisited",
    `is-${tier}`,
    selected ? "is-selected" : ""
  ].filter(Boolean).join(" ");
  return `<b class="${classes}" aria-hidden="true"></b>`;
};
