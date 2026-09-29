import { CollectibleIcon, escapeHtml } from "../collected-list.js";

export const markerLabel = (collectible) => `${collectible.name}, ${collectible.found ? "visited" : "unvisited"}${collectible.rarity ? `, ${collectible.rarity}` : ""}`;

export const WorldLegend = () => `
  <aside class="world-legend" aria-label="World marker legend">
    <span>${CollectibleIcon("coin")}<small>Coin</small></span>
    <span>${CollectibleIcon("landmark")}<small>Landmark</small></span>
    <i aria-hidden="true"></i>
    <span><b class="world-legend-dot world-legend-visited" aria-hidden="true"></b><small>Visited</small></span>
    <span><b class="world-legend-dot world-legend-unvisited" aria-hidden="true"></b><small>Unvisited</small></span>
    <span><b class="world-legend-dot world-legend-rare" aria-hidden="true"></b><small>Rare</small></span>
    <span><b class="world-legend-dot world-legend-epic" aria-hidden="true"></b><small>Epic</small></span>
  </aside>
`;

export const WorldMapEmptyState = (message) => `
  <p class="world-map-empty" role="status">${escapeHtml(message)}</p>
`;
