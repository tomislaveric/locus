import { describe, expect, it } from "vitest";
import { detectCoinPassage, detectFirstCoinPassages } from "./geometry.js";

describe("detectCoinPassage", () => {
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
});
