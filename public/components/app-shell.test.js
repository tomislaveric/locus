import { describe, expect, it } from "vitest";
import { navigableScreens } from "./app-shell.js";

describe("AppShell routing", () => {
  it("allows the sidebar Add Ride CTA to navigate to Add Activity", () => {
    expect(navigableScreens.has("add-activity")).toBe(true);
    expect(navigableScreens.has("add-ride")).toBe(false);
  });

  it("allows the sidebar Progress item to navigate to Progress", () => {
    expect(navigableScreens.has("progress")).toBe(true);
  });

  it("allows the sidebar Profile item to navigate to Profile", () => {
    expect(navigableScreens.has("profile")).toBe(true);
  });
});
