import { describe, expect, it } from "vitest";
import { usableFitTrackPoints } from "./fit.js";
import { SynchronizationError } from "./synchronization.js";

describe("FIT timestamp validation", () => {
  it("reports an explicit typed error for insufficient usable timestamps", () => {
    try {
      usableFitTrackPoints([{ position_lat: 1, position_long: 2, timestamp: "invalid" }]);
      throw new Error("Expected usableFitTrackPoints to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SynchronizationError);
      expect((error as SynchronizationError).code).toBe("INVALID_FIT_TIMESTAMPS");
    }
  });
});
