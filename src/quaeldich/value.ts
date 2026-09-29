/**
 * Deterministic mountain-pass gameplay value (XP) derived from source elevation.
 *
 * Higher passes reward more XP through a bounded, stepped curve so imported source
 * elevation never becomes an unbounded XP value. This mapping is intentionally the
 * single place elevation influences gameplay value: rebalance here without touching
 * imported source data. Missing/invalid elevation falls back to the lowest tier.
 */
const TIERS: readonly { minElevationMeters: number; value: number }[] = [
  { minElevationMeters: 2000, value: 600 },
  { minElevationMeters: 1500, value: 400 },
  { minElevationMeters: 1000, value: 250 },
  { minElevationMeters: 500, value: 150 }
];

const BASE_VALUE = 100;

export const mountainPassValueFromElevation = (elevationMeters: number | null | undefined): number => {
  if (typeof elevationMeters !== "number" || !Number.isFinite(elevationMeters)) {
    return BASE_VALUE;
  }
  for (const tier of TIERS) {
    if (elevationMeters >= tier.minElevationMeters) return tier.value;
  }
  return BASE_VALUE;
};
