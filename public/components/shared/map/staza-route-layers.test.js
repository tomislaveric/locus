import { describe, expect, it } from "vitest";
import { stazaRouteLayers, stazaSubduedRouteLayers } from "./staza-route-layers.js";

describe("stazaRouteLayers", () => {
  it("draws glow, casing and line in order from one source", () => {
    const layers = stazaRouteLayers("demo-route");

    expect(layers.map((layer) => layer.id)).toEqual([
      "demo-route-glow",
      "demo-route-casing",
      "demo-route-line"
    ]);
    expect(layers.every((layer) => layer.source === "demo-route")).toBe(true);
  });

  it("defaults to the quest gold accent and honours an override for a distinct route", () => {
    const quest = stazaRouteLayers("quest");
    const activity = stazaRouteLayers("activity", { accent: "#5ec8c2" });

    expect(quest.find((layer) => layer.id.endsWith("-line")).paint["line-color"]).toBe("#e8b80a");
    expect(activity.find((layer) => layer.id.endsWith("-line")).paint["line-color"]).toBe("#5ec8c2");
  });

  it("uses rounded joins and zoom-interpolated width", () => {
    for (const layer of stazaRouteLayers("r")) {
      expect(layer.layout["line-cap"]).toBe("round");
      expect(layer.paint["line-width"].slice(0, 3)).toEqual(["interpolate", ["linear"], ["zoom"]]);
    }
  });
});

describe("stazaSubduedRouteLayers", () => {
  it("renders only a muted casing and line so it stays secondary", () => {
    const layers = stazaSubduedRouteLayers("bg");

    expect(layers.map((layer) => layer.id)).toEqual(["bg-casing", "bg-line"]);
    expect(layers[1].paint["line-opacity"]).toBeLessThan(1);
  });
});
