import { describe, expect, it } from "vitest";
import {
  boundsCenter,
  filterCollectiblesByBounds,
  isWithinBounds,
  limitToViewportCap,
  parseBoundsParameter,
  splitBoundsAtAntimeridian
} from "./worldQuery.js";
import { UserInputError } from "./errors.js";

const collectible = (id: string, latitude: number, longitude: number) => ({
  id,
  name: id,
  type: "coin" as const,
  latitude,
  longitude,
  radiusMeters: 15,
  value: 10
});

const karlsruhe = { minLatitude: 48.9, maxLatitude: 49.1, minLongitude: 8.3, maxLongitude: 8.5 };

describe("viewport bounds parsing", () => {
  it("parses west,south,east,north into geo bounds", () => {
    expect(parseBoundsParameter("8.3,48.9,8.5,49.1")).toEqual(karlsruhe);
  });

  it("treats a missing bbox as a global query", () => {
    expect(parseBoundsParameter(undefined)).toBeUndefined();
  });

  it("rejects malformed, incomplete, and out-of-range bounds", () => {
    expect(() => parseBoundsParameter("8.3,48.9,8.5")).toThrow(UserInputError);
    expect(() => parseBoundsParameter("a,b,c,d")).toThrow(UserInputError);
    expect(() => parseBoundsParameter("8.3,-91,8.5,49")).toThrow(UserInputError);
    expect(() => parseBoundsParameter("-181,48,8.5,49")).toThrow(UserInputError);
    expect(() => parseBoundsParameter("8.3,49.1,8.5,48.9")).toThrow(UserInputError);
    expect(() => parseBoundsParameter(["8.3", "48.9"])).toThrow(UserInputError);
  });
});

describe("viewport filtering", () => {
  it("returns only collectibles inside the viewport", () => {
    const inside = collectible("inside", 49, 8.4);
    const northOfViewport = collectible("north", 49.5, 8.4);
    const eastOfViewport = collectible("east", 49, 9.4);
    expect(filterCollectiblesByBounds([inside, northOfViewport, eastOfViewport], karlsruhe).map((item) => item.id))
      .toEqual(["inside"]);
  });

  it("includes collectibles exactly on the viewport edge", () => {
    expect(isWithinBounds({ latitude: 48.9, longitude: 8.3 }, karlsruhe)).toBe(true);
    expect(isWithinBounds({ latitude: 49.1, longitude: 8.5 }, karlsruhe)).toBe(true);
  });

  it("returns an empty list for an empty viewport rather than failing", () => {
    expect(filterCollectiblesByBounds([], karlsruhe)).toEqual([]);
    expect(filterCollectiblesByBounds([collectible("far", 10, 10)], karlsruhe)).toEqual([]);
  });

  it("handles a viewport that crosses the antimeridian", () => {
    const crossing = { minLatitude: -10, maxLatitude: 10, minLongitude: 170, maxLongitude: -170 };
    expect(splitBoundsAtAntimeridian(crossing)).toEqual([
      { minLongitude: 170, maxLongitude: 180 },
      { minLongitude: -180, maxLongitude: -170 }
    ]);
    expect(filterCollectiblesByBounds([
      collectible("west-of-line", 0, 175),
      collectible("east-of-line", 0, -175),
      collectible("outside", 0, 0)
    ], crossing).map((item) => item.id)).toEqual(["west-of-line", "east-of-line"]);
  });

  it("centres normal and antimeridian viewports", () => {
    expect(boundsCenter(karlsruhe)).toEqual({ latitude: 49, longitude: 8.4 });
    expect(boundsCenter({ minLatitude: -10, maxLatitude: 10, minLongitude: 170, maxLongitude: -170 }))
      .toEqual({ latitude: 0, longitude: 180 });
  });
});

describe("viewport cap", () => {
  it("keeps every collectible when the viewport is below the cap", () => {
    const collectibles = [collectible("a", 49, 8.4), collectible("b", 49.01, 8.41)];
    expect(limitToViewportCap(collectibles, karlsruhe, 10)).toEqual({ collectibles, truncated: false });
  });

  it("keeps the collectibles nearest the viewport centre and reports truncation", () => {
    const result = limitToViewportCap([
      collectible("far", 49.09, 8.49),
      collectible("near", 49.001, 8.401),
      collectible("middle", 49.04, 8.44)
    ], karlsruhe, 2);
    expect(result.truncated).toBe(true);
    expect(result.collectibles.map((item) => item.id)).toEqual(["near", "middle"]);
  });
});
