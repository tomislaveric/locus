import { describe, expect, it } from "vitest";
import { extractFitMetadata, usableFitTrackPoints } from "./fit.js";
import { SynchronizationError } from "./synchronization.js";

describe("FIT metadata extraction", () => {
  it("reads a reliable title and description from named FIT messages", () => {
    const metadata = extractFitMetadata({
      workout: { wkt_name: "Morning Loop", notes: "Ridge and back" }
    });
    expect(metadata).toEqual({ title: "Morning Loop", description: "Ridge and back" });
  });

  it("falls back to a session sport profile name when no workout name exists", () => {
    const metadata = extractFitMetadata({ sessions: [{ sport_profile_name: "Road Cycling" }] });
    expect(metadata).toEqual({ title: "Road Cycling" });
  });

  it("omits blank or missing name fields", () => {
    expect(extractFitMetadata({ workout: { wkt_name: "   " }, session: { notes: "" } })).toEqual({});
    expect(extractFitMetadata({})).toEqual({});
  });
});

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
