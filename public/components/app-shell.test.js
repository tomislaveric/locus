import { describe, expect, it } from "vitest";
import { navigableScreens } from "./app-shell.js";

describe("AppShell routing", () => {
  it("allows the sidebar Add Ride CTA to navigate to Add Activity", () => {
    expect(navigableScreens.has("add-activity")).toBe(true);
    expect(navigableScreens.has("add-ride")).toBe(false);
  });
});
