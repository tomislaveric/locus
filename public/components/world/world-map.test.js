import { describe, expect, it, vi } from "vitest";
import { ROUTE_SOURCE_ID, loadStazaStyle, routeLayers, routeToGeoJson } from "./world-map.js";
import { STAZA_DARK_PALETTE } from "./staza-map-theme.js";

const providerStyle = () => ({
  version: 8,
  sources: { openmaptiles: { type: "vector", url: "https://tiles.example/planet" } },
  layers: [{ id: "background", type: "background", paint: { "background-color": "#f8f4f0" } }]
});

describe("loadStazaStyle", () => {
  it("themes the fetched provider style", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => providerStyle() });

    const style = await loadStazaStyle("https://tiles.example/styles/liberty", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith("https://tiles.example/styles/liberty");
    expect(style.layers[0].paint["background-color"]).toBe(STAZA_DARK_PALETTE.background);
  });

  it("falls back to the provider url when the style cannot be fetched", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(loadStazaStyle("https://tiles.example/styles/liberty", failing))
      .resolves.toBe("https://tiles.example/styles/liberty");
  });

  it("falls back to the provider url on a non-ok response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    await expect(loadStazaStyle("https://tiles.example/styles/liberty", fetchImpl))
      .resolves.toBe("https://tiles.example/styles/liberty");
  });
});

describe("quest route layers", () => {
  it("draws glow, casing and line in that order from one source", () => {
    const layers = routeLayers();

    expect(layers.map((layer) => layer.id)).toEqual([
      `${ROUTE_SOURCE_ID}-glow`,
      `${ROUTE_SOURCE_ID}-casing`,
      `${ROUTE_SOURCE_ID}-line`
    ]);
    expect(layers.every((layer) => layer.source === ROUTE_SOURCE_ID)).toBe(true);
  });

  it("uses rounded joins and zoom-interpolated width", () => {
    for (const layer of routeLayers()) {
      expect(layer.layout["line-cap"]).toBe("round");
      expect(layer.layout["line-join"]).toBe("round");
      expect(layer.paint["line-width"].slice(0, 3)).toEqual(["interpolate", ["linear"], ["zoom"]]);
    }
  });

  it("keeps the Staza accent on the visible route line", () => {
    const line = routeLayers().find((layer) => layer.id.endsWith("-line"));

    expect(line.paint["line-color"]).toBe("#e8b80a");
  });
});

describe("routeToGeoJson", () => {
  it("never fabricates geometry for quests without a route", () => {
    expect(routeToGeoJson(undefined).geometry).toEqual({ type: "LineString", coordinates: [] });
  });
});
