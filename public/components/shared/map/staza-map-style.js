import { applyStazaMapTheme } from "./staza-map-theme.js";

/**
 * Loads the provider style document and returns it themed for Staza. Falls back to the
 * plain style URL so a provider or network hiccup degrades to the untouched basemap. This
 * is the single entry point both World and Activity Detail use to obtain the Staza basemap.
 */
export const loadStazaStyle = async (styleUrl, fetchImpl = fetch) => {
  try {
    const response = await fetchImpl(styleUrl);
    if (!response.ok) throw new Error(`Basemap style request failed with ${response.status}.`);
    return applyStazaMapTheme(await response.json());
  } catch {
    return styleUrl;
  }
};
