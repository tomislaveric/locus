import { describe, expect, it } from "vitest";
import type { MappedGameEvent } from "./domain.js";
import { planHighlights } from "./highlightPlanner.js";

const event = (id: string, videoSecond: number): MappedGameEvent => ({
  id,
  type: "coin",
  value: 100,
  latitude: 0,
  longitude: 0,
  activityTimestamp: videoSecond * 1_000,
  videoSecond
});

const options = { preRollSeconds: 3, postRollSeconds: 3, videoDurationSeconds: 100 };

describe("planHighlights", () => {
  it("merges overlapping windows into chronological segments", () => {
    expect(planHighlights([event("A", 20), event("B", 24), event("C", 90)], options)).toEqual({
      segments: [
        { startSecond: 17, endSecond: 27, eventIds: ["A", "B"] },
        { startSecond: 87, endSecond: 93, eventIds: ["C"] }
      ],
      totalDurationSeconds: 16
    });
  });

  it("produces the same plan for unordered input and uses IDs to break equal-timestamp ties", () => {
    const events = [event("zeta", 20), event("alpha", 20), event("later", 30)];
    expect(planHighlights(events, options)).toEqual(planHighlights([...events].reverse(), options));
    expect(planHighlights(events, options).segments[0].eventIds).toEqual(["alpha", "zeta"]);
  });

  it("clamps boundary windows and merges contained windows", () => {
    expect(planHighlights([event("start", 0), event("contained", 2), event("end", 100)], options)).toEqual({
      segments: [
        { startSecond: 0, endSecond: 5, eventIds: ["start", "contained"] },
        { startSecond: 97, endSecond: 100, eventIds: ["end"] }
      ],
      totalDurationSeconds: 8
    });
  });

  it("deduplicates IDs and ignores events outside the source video", () => {
    expect(planHighlights([event("duplicate", 20), event("other", 21), event("duplicate", 22), event("before", -1), event("after", 101)], options)).toEqual({
      segments: [{ startSecond: 17, endSecond: 24, eventIds: ["duplicate", "other"] }],
      totalDurationSeconds: 7
    });
  });

  it.each([
    [{ ...options, preRollSeconds: -1 }],
    [{ ...options, postRollSeconds: Number.POSITIVE_INFINITY }],
    [{ ...options, videoDurationSeconds: Number.NaN }],
    [JSON.parse('{"preRollSeconds":3,"postRollSeconds":3}')]
  ])("rejects invalid planner options", (invalidOptions) => {
    expect(() => planHighlights([], invalidOptions)).toThrow("must be a finite, non-negative number");
  });

  it("returns an empty plan for no valid selections", () => {
    expect(planHighlights([event("before", -1)], options)).toEqual({ segments: [], totalDurationSeconds: 0 });
  });
});
