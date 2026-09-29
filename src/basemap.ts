import { config } from "./config.js";

export interface BasemapConfig {
  styleUrl: string;
  attribution: string;
}

/**
 * Boundary for the basemap tile provider. World logic never names a provider, so the
 * tile source can be replaced through configuration alone.
 */
export const getBasemapConfig = (): BasemapConfig => ({
  styleUrl: config.basemapStyleUrl,
  attribution: config.basemapAttribution
});

/** Origins the browser must be allowed to reach to load the configured basemap. */
export const getBasemapOrigins = (): string[] => {
  const origins = new Set<string>(config.basemapExtraOrigins);
  try {
    origins.add(new URL(config.basemapStyleUrl).origin);
  } catch {
    return [...origins];
  }
  return [...origins];
};
