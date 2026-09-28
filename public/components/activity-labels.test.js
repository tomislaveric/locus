import { describe, expect, it } from "vitest";
import { getActivityCompleteLabel, getActivityLabel } from "./activity-labels.js";

describe("activity presentation labels", () => {
  it.each([
    ["cycling", "Ride complete", "Rides"],
    ["running", "Run complete", "Runs"],
    ["hiking", "Hike complete", "Hikes"],
    ["walking", "Walk complete", "Walks"],
    ["unknown", "Activity complete", "Activities"]
  ])("formats %s activity labels", (type, complete, plural) => {
    expect(getActivityCompleteLabel(type)).toBe(complete);
    expect(getActivityLabel(type, 2)).toBe(plural);
  });
});
