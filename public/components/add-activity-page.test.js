import { describe, expect, it } from "vitest";
import { AddActivityPage } from "./add-activity-page.js";

describe("AddActivityPage", () => {
  it("renders accessible required FIT and optional video upload controls", () => {
    const page = AddActivityPage();
    expect(page).toContain('name="fit"');
    expect(page).toContain("required");
    expect(page).toContain('name="video"');
    expect(page).toContain("Add video (optional)");
    expect(page).toContain("SELECT ACTIVITY FILE");
  });

  it("renders factual persisted activity completion", () => {
    const page = AddActivityPage({
      complete: { id: "ride-1", collectedCount: 2, xpEarned: 75 }
    });
    expect(page).toContain("Ride Ready");
    expect(page).toContain("2 collectibles found along your route");
    expect(page).toContain("+75 XP");
    expect(page).toContain("VIEW RIDE");
  });

  it("keeps an optional video failure separate from successful activity import", () => {
    const page = AddActivityPage({
      complete: { id: "ride-1", collectedCount: 0, xpEarned: 0 },
      error: "No GPS5 track was found."
    });
    expect(page).toContain("Ride Ready");
    expect(page).toContain("Your ride was saved, but video processing could not start");
  });
});
