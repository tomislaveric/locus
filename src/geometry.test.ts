import { describe, expect, it } from "vitest";
import { detectCoinPassage } from "./geometry.js";

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
});
