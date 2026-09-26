import { describe, expect, it } from "vitest";
import { detectCoinPassage, detectFirstCoinPassages } from "./geometry.js";

describe("detectCoinPassage", () => {
  const longitudeAtEquator = (meters: number): number => meters / 111_195;
  const coin = { id: "coin", latitude: 0, longitude: 0, radius_m: 10, value: 100 };

  it("reports a crossing exactly on a FIT sample", () => {
    expect(detectCoinPassage(
      [
        { latitude: 0, longitude: longitudeAtEquator(20), timestampMs: 1_000 },
        { latitude: 0, longitude: longitudeAtEquator(10), timestampMs: 2_000 }
      ],
      coin
    )).toBeCloseTo(2_000, 2);
  });

  it("interpolates a crossing between sparse FIT samples", () => {
    expect(detectCoinPassage(
      [
        { latitude: 0, longitude: longitudeAtEquator(30), timestampMs: 1_000 },
        { latitude: 0, longitude: 0, timestampMs: 5_000 }
      ],
      coin
    )).toBeCloseTo(3_666.667, 2);
  });

  it("does not report tracks that remain outside or begin inside without re-entry", () => {
    expect(detectCoinPassage(
      [
        { latitude: 0, longitude: longitudeAtEquator(30), timestampMs: 1_000 },
        { latitude: 0, longitude: longitudeAtEquator(20), timestampMs: 2_000 }
      ],
      coin
    )).toBeUndefined();
    expect(detectCoinPassage(
      [
        { latitude: 0, longitude: 0, timestampMs: 1_000 },
        { latitude: 0, longitude: longitudeAtEquator(20), timestampMs: 2_000 }
      ],
      coin
    )).toBeUndefined();
  });

  it("ignores the exit after the first entry", () => {
    expect(detectCoinPassage(
      [
        { latitude: 0, longitude: longitudeAtEquator(20), timestampMs: 1_000 },
        { latitude: 0, longitude: 0, timestampMs: 2_000 },
        { latitude: 0, longitude: longitudeAtEquator(20), timestampMs: 3_000 }
      ],
      coin
    )).toBeCloseTo(1_500, 2);
  });

  it("interpolates an outside-to-inside passage", () => {
    const passage = detectCoinPassage(
      [
        { latitude: 48, longitude: 11.0005, timestampMs: 1_000 },
        { latitude: 48, longitude: 11.0001, timestampMs: 2_000 }
      ],
      { id: "coin", latitude: 48, longitude: 11.0001, radius_m: 20, value: 100 }
    );
    expect(passage).toBeGreaterThan(1_000);
    expect(passage).toBeLessThan(2_000);
  });

  it("keeps only the first passage for each coin and orders passages by time", () => {
    const passages = detectFirstCoinPassages(
      [
        { latitude: 48, longitude: 11.0005, timestampMs: 1_000 },
        { latitude: 48, longitude: 11.0001, timestampMs: 2_000 },
        { latitude: 48, longitude: 11.0005, timestampMs: 3_000 },
        { latitude: 48, longitude: 11.0015, timestampMs: 4_000 },
        { latitude: 48, longitude: 11.0011, timestampMs: 5_000 },
        { latitude: 48, longitude: 11.0015, timestampMs: 6_000 }
      ],
      [
        { id: "second", latitude: 48, longitude: 11.0011, radius_m: 20, value: 100 },
        { id: "first", latitude: 48, longitude: 11.0001, radius_m: 20, value: 200 }
      ]
    );

    expect(passages.map((passage) => passage.coin.id)).toEqual(["first", "second"]);
    expect(passages[0].timestampMs).toBeLessThan(passages[1].timestampMs);
  });

  it("uses the first entry crossing rather than an exit crossing", () => {
    const passage = detectCoinPassage(
      [
        { latitude: 48, longitude: 11.0001, timestampMs: 1_000 },
        { latitude: 48, longitude: 11.0005, timestampMs: 2_000 },
        { latitude: 48, longitude: 11.0001, timestampMs: 3_000 }
      ],
      { id: "coin", latitude: 48, longitude: 11.0001, radius_m: 20, value: 100 }
    );

    expect(passage).toBeGreaterThan(2_000);
    expect(passage).toBeLessThan(3_000);
  });
});
