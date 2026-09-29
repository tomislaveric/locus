import { EMPTY_FEATURE_COLLECTION } from "./collectible-features.js";

export const COLLECTIBLE_SOURCE = "staza-collectibles";
export const COLLECTIBLE_LAYER = "staza-collectibles";
export const COLLECTIBLE_SELECTED_LAYER = "staza-collectibles-selected";

const RARITY_COLOR = ["match", ["get", "rarity"],
  "rare", "#4d9de0",
  "epic", "#9b6ddf",
  "#c8ccd6"];

const collectibleLayer = () => ({
  id: COLLECTIBLE_LAYER,
  type: "circle",
  source: COLLECTIBLE_SOURCE,
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 12, 8, 16, 11],
    "circle-color": ["case", ["get", "visited"], RARITY_COLOR, "#171a20"],
    "circle-opacity": ["case", ["get", "visited"], 0.95, 0.72],
    "circle-stroke-width": ["case", ["==", ["get", "rarity"], "common"], 1.5, 2.5],
    "circle-stroke-color": ["case", ["get", "visited"], "#0b0c0f", RARITY_COLOR],
    "circle-stroke-opacity": ["case", ["get", "visited"], 0.75, 0.95]
  }
});

const selectedCollectibleLayer = () => ({
  id: COLLECTIBLE_SELECTED_LAYER,
  type: "circle",
  source: COLLECTIBLE_SOURCE,
  filter: ["==", ["get", "selected"], true],
  paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 10, 12, 13, 16, 16],
    "circle-color": "#e8b80a",
    "circle-opacity": 0.12,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#e8b80a",
    "circle-stroke-opacity": 0.95
  }
});

/**
 * Adds the canonical collectible source and its layers once. Layers are appended last so
 * collectibles draw above the basemap and the quest route.
 */
export const ensureCollectibleLayers = (map) => {
  if (map.getSource(COLLECTIBLE_SOURCE)) return;
  map.addSource(COLLECTIBLE_SOURCE, {
    type: "geojson",
    promoteId: "id",
    data: EMPTY_FEATURE_COLLECTION
  });
  map.addLayer(collectibleLayer());
  map.addLayer(selectedCollectibleLayer());
};

export const setCollectibleData = (map, featureCollection) => {
  const source = map.getSource(COLLECTIBLE_SOURCE);
  if (!source) return false;
  source.setData(featureCollection ?? EMPTY_FEATURE_COLLECTION);
  return true;
};

const featureCollectibleId = (event) => event?.features?.[0]?.properties?.id;

/** Routes native layer events into the existing World selection flow. */
export const bindCollectibleInteractions = (map, { onSelect }) => {
  map.on("click", COLLECTIBLE_LAYER, (event) => {
    const id = featureCollectibleId(event);
    if (id === undefined) return;
    if (event.originalEvent?.stopPropagation) event.originalEvent.stopPropagation();
    onSelect(id);
  });
  map.on("mouseenter", COLLECTIBLE_LAYER, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", COLLECTIBLE_LAYER, () => {
    map.getCanvas().style.cursor = "";
  });
};
