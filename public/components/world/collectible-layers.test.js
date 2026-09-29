import { describe, expect, it, vi } from "vitest";
import {
  bindCollectibleInteractions,
  COLLECTIBLE_LAYER,
  COLLECTIBLE_SELECTED_LAYER,
  COLLECTIBLE_SOURCE,
  ensureCollectibleLayers,
  setCollectibleData
} from "./collectible-layers.js";

const fakeMap = () => {
  const sources = new Map();
  const layers = [];
  const handlers = new Map();
  const canvas = { style: {} };
  return {
    sources,
    layers,
    canvas,
    addSource(id, source) {
      sources.set(id, { ...source, setData: vi.fn() });
    },
    getSource: (id) => sources.get(id),
    addLayer(layer) {
      layers.push(layer);
    },
    getLayer: (id) => layers.find((layer) => layer.id === id),
    on(type, layerId, handler) {
      handlers.set(`${type}:${layerId}`, handler);
    },
    emit(type, layerId, event) {
      handlers.get(`${type}:${layerId}`)?.(event);
    },
    getCanvas: () => canvas
  };
};

describe("collectible source and layers", () => {
  it("adds one canonical source and both collectible layers", () => {
    const map = fakeMap();

    ensureCollectibleLayers(map);

    expect(map.getSource(COLLECTIBLE_SOURCE).type).toBe("geojson");
    expect(map.getSource(COLLECTIBLE_SOURCE).promoteId).toBe("id");
    expect(map.layers.map((layer) => layer.id)).toEqual([COLLECTIBLE_LAYER, COLLECTIBLE_SELECTED_LAYER]);
  });

  it("draws the selection emphasis from the same source instead of a separate dataset", () => {
    const map = fakeMap();

    ensureCollectibleLayers(map);

    const selected = map.getLayer(COLLECTIBLE_SELECTED_LAYER);
    expect(selected.source).toBe(COLLECTIBLE_SOURCE);
    expect(selected.filter).toEqual(["==", ["get", "selected"], true]);
  });

  it("is idempotent so repeated renders never rebuild the layer stack", () => {
    const map = fakeMap();

    ensureCollectibleLayers(map);
    ensureCollectibleLayers(map);

    expect(map.layers).toHaveLength(2);
  });

  it("updates viewport data through setData on the existing source", () => {
    const map = fakeMap();
    ensureCollectibleLayers(map);
    const featureCollection = { type: "FeatureCollection", features: [] };

    expect(setCollectibleData(map, featureCollection)).toBe(true);

    expect(map.getSource(COLLECTIBLE_SOURCE).setData).toHaveBeenCalledWith(featureCollection);
    expect(map.layers).toHaveLength(2);
  });

  it("ignores data updates before the source exists", () => {
    expect(setCollectibleData(fakeMap(), { type: "FeatureCollection", features: [] })).toBe(false);
  });
});

describe("collectible layer interactions", () => {
  it("selects the clicked collectible exactly once", () => {
    const map = fakeMap();
    const onSelect = vi.fn();
    bindCollectibleInteractions(map, { onSelect });

    map.emit("click", COLLECTIBLE_LAYER, { features: [{ properties: { id: "castle-7" } }] });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("castle-7");
  });

  it("ignores clicks without a collectible feature", () => {
    const map = fakeMap();
    const onSelect = vi.fn();
    bindCollectibleInteractions(map, { onSelect });

    map.emit("click", COLLECTIBLE_LAYER, { features: [] });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows and clears the pointer cursor on hover", () => {
    const map = fakeMap();
    bindCollectibleInteractions(map, { onSelect: vi.fn() });

    map.emit("mouseenter", COLLECTIBLE_LAYER, {});
    expect(map.canvas.style.cursor).toBe("pointer");

    map.emit("mouseleave", COLLECTIBLE_LAYER, {});
    expect(map.canvas.style.cursor).toBe("");
  });
});
