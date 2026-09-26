import { describe, expect, it } from "vitest";
import { getRelevantCollectibles, getRouteBounds, padGeoBounds } from "./worldQuery.js";

const collectible = (id: string, latitude: number, longitude: number) => ({
  id,
  name: id,
  type: "coin" as const,
  latitude,
  longitude,
  radiusMeters: 10,
  value: 10
});

describe("world query", () => {
  it("returns no bounds for an empty route and exact bounds for point, north/south, and east/west routes", () => {
    expect(getRouteBounds([])).toBeUndefined();
    expect(getRouteBounds([{ latitude: 1, longitude: 2, timestampMs: 0 }])).toEqual({
      minLatitude: 1, maxLatitude: 1, minLongitude: 2, maxLongitude: 2
    });
    expect(getRouteBounds([
      { latitude: 2, longitude: 4, timestampMs: 0 },
      { latitude: 0, longitude: 4, timestampMs: 1 }
    ])).toEqual({ minLatitude: 0, maxLatitude: 2, minLongitude: 4, maxLongitude: 4 });
    expect(getRouteBounds([
      { latitude: 1, longitude: 8, timestampMs: 0 },
      { latitude: 1, longitude: 3, timestampMs: 1 }
    ])).toEqual({ minLatitude: 1, maxLatitude: 1, minLongitude: 3, maxLongitude: 8 });
  });

  it("pads bounds in meter-based latitude and latitude-aware longitude degrees", () => {
    const padded = padGeoBounds({ minLatitude: 0, maxLatitude: 0, minLongitude: 0, maxLongitude: 0 }, 111_320);
    expect(padded.minLatitude).toBeCloseTo(-1);
    expect(padded.maxLatitude).toBeCloseTo(1);
    expect(padded.minLongitude).toBeCloseTo(-1);
    expect(padded.maxLongitude).toBeCloseTo(1);
  });

  it("includes inclusive exact and padded bounds while excluding far-away collectibles", () => {
    const route = [
      { latitude: 0, longitude: 0, timestampMs: 0 },
      { latitude: 0, longitude: 0.01, timestampMs: 1 }
    ];
    const items = [
      collectible("exact", 0, 0.01),
      collectible("padded", 0.004, 0.005),
      collectible("outside", 0.01, 0.005)
    ];

    expect(getRelevantCollectibles(items, route, 500).map((item) => item.id)).toEqual(["exact", "padded"]);
    expect(getRelevantCollectibles(items, [], 500)).toEqual([]);
  });

  it("retains a large-radius collectible whose collection area reaches the padded route bounds", () => {
    const route = [
      { latitude: 0, longitude: 0, timestampMs: 0 },
      { latitude: 0, longitude: 0.01, timestampMs: 1 }
    ];
    const largeRadius = { ...collectible("large-radius", 0.01, 0.005), radiusMeters: 1_000 };

    expect(getRelevantCollectibles([largeRadius], route, 500)).toEqual([largeRadius]);
  });
});
