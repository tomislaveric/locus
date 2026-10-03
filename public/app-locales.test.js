import { describe, expect, it } from "vitest";
import {
  appCopy,
  appPath,
  appRoutes,
  parseAppPath,
  resolvePreferredLocale,
  setAppLocale,
  translateAppText,
  translateAppTextNode
} from "./app-locales.js";
import { AppShell } from "./components/app-shell.js";
import { formatActivityDate, formatActivityDistance } from "./components/activities-page.js";

describe("public app locale and route handling", () => {
  it("keeps the English and German UI catalogs in sync", () => {
    expect(Object.keys(appCopy.de).sort()).toEqual(Object.keys(appCopy.en).sort());
    expect(translateAppText("Activities", "de")).toBe("Aktivitäten");
    expect(translateAppText("Activities", "en")).toBe("Activities");
    for (const copy of [
      "Welcome back",
      "Complete a FIT activity to see your exploration history here.",
      "Passkeys use your device to sign in without a password.",
      "Nothing curated here yet.",
      "Select which moments to include in your highlight video"
    ]) {
      expect(appCopy.de[copy]).toBeTruthy();
    }
  });

  it("uses locale-aware labels and formats without adding a language switcher", () => {
    expect(AppShell("de")).toContain('href="/de/start"');
    expect(AppShell("de")).not.toContain("language-switcher");
    setAppLocale("de");
    expect(formatActivityDistance(5_400)).toBe("5,4 km");
    expect(formatActivityDate("2026-09-26T12:00:00.000Z")).not.toBe("SAT, SEP 26");
    setAppLocale("en");
    expect(formatActivityDistance(5_400)).toBe("5.4 km");
  });

  it("selects the first supported browser language and falls back to English", () => {
    expect(resolvePreferredLocale(["fr-FR", "de-DE", "en-US"])).toBe("de");
    expect(resolvePreferredLocale(["fr-FR", "en-GB"])).toBe("en");
    expect(resolvePreferredLocale(["fr-FR", "it-IT"])).toBe("en");
  });

  it("prefers explicit URL locales over browser preferences", () => {
    expect(parseAppPath("/de/start", ["en-US"])).toMatchObject({ locale: "de", screen: "home" });
    expect(parseAppPath("/en/world", ["de-DE"])).toMatchObject({ locale: "en", screen: "world" });
  });

  it("maps every declared screen to its localized route", () => {
    for (const locale of ["en", "de"]) {
      for (const screen of Object.keys(appRoutes[locale])) {
        const path = appPath(locale, screen, "activity/id");
        const route = parseAppPath(path, [locale]);
        expect(route.locale).toBe(locale);
        expect(route.screen).toBe(screen);
        if (screen === "activity-detail") expect(route.activityId).toBe("activity/id");
      }
    }
    expect(appPath("de", "activities")).toBe("/de/aktivitaeten");
    expect(appPath("de", "activity-detail", "ride 1")).toBe("/de/aktivitaeten/ride%201");
  });

  it("normalizes legacy entry paths to the preferred locale sign-in route", () => {
    expect(parseAppPath("/app", ["de-AT", "en-US"])).toMatchObject({
      locale: "de",
      screen: "sign-in",
      path: "/de/anmelden",
      legacy: true
    });
    expect(parseAppPath("/sign-in", ["fr-FR"])).toMatchObject({
      locale: "en",
      screen: "sign-in",
      path: "/en/sign-in",
      legacy: true
    });
  });

  it("preserves dynamic text in localized message prefixes", () => {
    expect(translateAppTextNode("Unable to load World: server response", "de"))
      .toBe("Welt konnte nicht geladen werden: server response");
    expect(translateAppTextNode("rider@example.com", "de")).toBe("rider@example.com");
  });

  it("returns a not-found route for unknown paths and malformed activity ids", () => {
    expect(parseAppPath("/de/unknown", ["en-US"]).screen).toBe("not-found");
    expect(parseAppPath("/en/activities/%E0%A4%A", ["de-DE"]).screen).toBe("not-found");
  });
});
