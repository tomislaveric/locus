import { CollectibleIcon, canonicalRarity, escapeHtml } from "../collected-list.js";

export const markerClassName = (collectible, selected) => {
  const rarity = canonicalRarity(collectible.rarity) ?? "common";
  return [
    "world-marker",
    collectible.found ? "is-found" : "is-unfound",
    `rarity-${rarity}`,
    ...(selected ? ["is-selected"] : [])
  ].join(" ");
};

export const markerLabel = (collectible) => `${collectible.name}, ${collectible.found ? "visited" : "unvisited"}${collectible.rarity ? `, ${collectible.rarity}` : ""}`;

export const markerInnerHtml = (collectible) => {
  const rarity = canonicalRarity(collectible.rarity) ?? "common";
  return `<span class="world-marker-icon">${CollectibleIcon(collectible.type, rarity === "common" ? undefined : rarity)}</span>`;
};

export const createMarkerElement = (collectible, { selected, onSelect }) => {
  const element = document.createElement("button");
  element.type = "button";
  element.className = markerClassName(collectible, selected);
  element.dataset.worldMarker = collectible.id;
  element.setAttribute("aria-pressed", String(Boolean(selected)));
  element.setAttribute("aria-label", markerLabel(collectible));
  element.title = collectible.name;
  element.innerHTML = markerInnerHtml(collectible);
  element.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect(collectible.id);
  });
  return element;
};

export const WorldLegend = () => `
  <aside class="world-legend" aria-label="World marker legend">
    <span>${CollectibleIcon("coin")}<small>Coin</small></span>
    <span>${CollectibleIcon("landmark")}<small>Landmark</small></span>
    <i aria-hidden="true"></i>
    <span><b class="world-legend-unvisited" aria-hidden="true"></b><small>Unvisited</small></span>
  </aside>
`;

export const WorldMapEmptyState = (message) => `
  <p class="world-map-empty" role="status">${escapeHtml(message)}</p>
`;
