import { CollectibleIcon, canonicalRarity, escapeHtml } from "./collected-list.js";

export const worldFilters = ["all", "found", "unfound", "rare", "epic"];

const filterLabels = {
  all: "All",
  found: "Found",
  unfound: "Unfound",
  rare: "Rare",
  epic: "Epic"
};

const formatNumber = (value) => new Intl.NumberFormat("en-US").format(value);

export const visibleWorldCollectibles = (collectibles) =>
  collectibles.filter((collectible) => collectible.visibility !== "hidden");

export const filteredWorldCollectibles = (collectibles, activeFilter) => visibleWorldCollectibles(collectibles).filter((collectible) => {
  if (activeFilter === "found") return collectible.found;
  if (activeFilter === "unfound") return !collectible.found;
  if (activeFilter === "rare" || activeFilter === "epic") return collectible.rarity === activeFilter;
  return true;
});

export const worldMarkerPositions = (collectibles) => {
  if (!collectibles.length) return new Map();
  const latitudes = collectibles.map((collectible) => collectible.latitude);
  const longitudes = collectibles.map((collectible) => collectible.longitude);
  const minimumLatitude = Math.min(...latitudes);
  const maximumLatitude = Math.max(...latitudes);
  const minimumLongitude = Math.min(...longitudes);
  const maximumLongitude = Math.max(...longitudes);
  const latitudeRange = maximumLatitude - minimumLatitude;
  const longitudeRange = maximumLongitude - minimumLongitude;
  const inset = 8;

  return new Map(collectibles.map((collectible) => {
    const horizontal = longitudeRange === 0
      ? 50
      : inset + ((collectible.longitude - minimumLongitude) / longitudeRange) * (100 - inset * 2);
    const vertical = latitudeRange === 0
      ? 50
      : 100 - inset - ((collectible.latitude - minimumLatitude) / latitudeRange) * (100 - inset * 2);
    return [collectible.id, { horizontal, vertical }];
  }));
};

export const WorldFilterTabs = (activeFilter) => `
  <div class="world-filter-tabs" role="tablist" aria-label="World collectibles">
    ${worldFilters.map((filter) => `
      <button class="${filter === activeFilter ? "is-active" : ""}" type="button" role="tab"
        aria-selected="${filter === activeFilter}" data-world-filter="${filter}">
        ${filterLabels[filter]}
      </button>
    `).join("")}
  </div>
`;

export const WorldMarker = (collectible, position, selected) => {
  const rarity = canonicalRarity(collectible.rarity) ?? "common";
  return `
    <button class="world-marker ${collectible.found ? "is-found" : "is-unfound"} rarity-${rarity}${selected ? " is-selected" : ""}"
      type="button" data-world-marker="${escapeHtml(collectible.id)}" aria-pressed="${selected}"
      aria-label="${escapeHtml(`${collectible.name}, ${collectible.found ? "found" : "unfound"}${collectible.rarity ? `, ${collectible.rarity}` : ""}`)}"
      title="${escapeHtml(collectible.name)}"
      style="--world-x: ${position.horizontal}%; --world-y: ${position.vertical}%;">
      <span class="world-marker-icon">${CollectibleIcon(collectible.type, rarity === "common" ? undefined : rarity)}</span>
    </button>
  `;
};

export const WorldLegend = () => `
  <aside class="world-legend" aria-label="World marker legend">
    <span>${CollectibleIcon("coin")}<small>Coin</small></span>
    <span>${CollectibleIcon("landmark")}<small>Landmark</small></span>
    <i aria-hidden="true"></i>
    <span><b class="world-legend-undiscovered" aria-hidden="true"></b><small>Undiscovered</small></span>
  </aside>
`;

export const WorldMap = ({ collectibles, allCollectibles, totalCollectibles, selectedSourceId, activeFilter }) => {
  if (!allCollectibles.length) {
    return `
      <section class="world-map world-map-empty" aria-label="World map">
        <p>${totalCollectibles ? "NO COLLECTIBLES REVEALED" : "NO COLLECTIBLES CONFIGURED"}</p>
        <span>${totalCollectibles
    ? "Explore this world to reveal available collectibles."
    : "Add collectibles to the configured catalog to explore this world."}</span>
      </section>
    `;
  }
  if (!collectibles.length) {
    return `
      <section class="world-map world-map-empty" aria-label="World map">
        <p>NO ${filterLabels[activeFilter].toUpperCase()} COLLECTIBLES</p>
        <span>Try another filter to explore the rest of this world.</span>
      </section>
    `;
  }

  const positions = worldMarkerPositions(allCollectibles);
  return `
    <section class="world-map" aria-label="World map">
      <div class="world-map-terrain" aria-hidden="true"><span></span><span></span><span></span></div>
      ${collectibles.map((collectible) => WorldMarker(
        collectible,
        positions.get(collectible.id),
        collectible.id === selectedSourceId
      )).join("")}
      ${WorldLegend()}
    </section>
  `;
};

export const WorldStats = (stats) => `
  <p class="world-stats">
    <span>${formatNumber(stats.discoveredCount)} discovered</span>
    <i aria-hidden="true">·</i>
    <strong class="rarity-rare">${formatNumber(stats.rareFinds)} rare</strong>
    <i aria-hidden="true">·</i>
    <strong class="rarity-epic">${formatNumber(stats.epicFinds)} epic</strong>
    <i aria-hidden="true">·</i>
    <span>${formatNumber(stats.remainingCount)} remaining</span>
  </p>
`;

export const WorldPage = ({ snapshot, activeFilter, selectedSourceId }) => {
  const visibleCollectibles = visibleWorldCollectibles(snapshot.collectibles);
  const collectibles = filteredWorldCollectibles(snapshot.collectibles, activeFilter);
  const { stats } = snapshot;
  return `
    <section class="world-page" aria-labelledby="world-title">
      <header class="world-header">
        <div>
          <h1 id="world-title">World</h1>
          <p>Explore your region</p>
        </div>
        <div class="world-discovered">
          <span>Discovered</span>
          <strong>${formatNumber(stats.discoveredCount)} <i>/ ${formatNumber(stats.totalCollectibles)}</i></strong>
        </div>
      </header>
      ${WorldFilterTabs(activeFilter)}
      ${WorldMap({
    collectibles,
    allCollectibles: visibleCollectibles,
    totalCollectibles: stats.totalCollectibles,
    selectedSourceId,
    activeFilter
  })}
      ${WorldStats(stats)}
    </section>
  `;
};

const responseJson = async (response) => {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to load World data.");
  return body;
};

export const mountWorldPage = async (mountPoint) => {
  mountPoint.innerHTML = '<section class="world-page"><p class="world-loading" role="status">Loading World...</p></section>';
  try {
    const snapshot = await fetch("/api/world").then(responseJson);
    let activeFilter = "all";
    let selectedSourceId;

    const render = () => {
      mountPoint.innerHTML = WorldPage({ snapshot, activeFilter, selectedSourceId });
      mountPoint.querySelectorAll("[data-world-filter]").forEach((tab) => {
        tab.addEventListener("click", () => {
          activeFilter = tab.dataset.worldFilter;
          if (!filteredWorldCollectibles(snapshot.collectibles, activeFilter).some((item) => item.id === selectedSourceId)) {
            selectedSourceId = undefined;
          }
          render();
        });
      });
      mountPoint.querySelectorAll("[data-world-marker]").forEach((marker) => {
        marker.addEventListener("click", () => {
          selectedSourceId = selectedSourceId === marker.dataset.worldMarker ? undefined : marker.dataset.worldMarker;
          render();
        });
      });
    };
    render();
  } catch (error) {
    mountPoint.innerHTML = `<section class="world-page"><p class="world-load-error" role="alert">Unable to load World: ${escapeHtml(error.message)}</p></section>`;
  }
};
