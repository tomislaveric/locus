import path from "node:path";

const integerEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
};

const decimalEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
};

const booleanEnv = (name: string, fallback: boolean): boolean => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
};

export const config = {
  port: integerEnv("PORT", 3000),
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data/jobs"),
  coinsFile: path.resolve(process.env.COINS_FILE ?? "./coins.json"),
  maxUploadBytes: integerEnv("MAX_UPLOAD_BYTES", 6 * 1024 * 1024 * 1024),
  jobTtlMs: integerEnv("JOB_TTL_MS", 30 * 60 * 1000),
  selectionTtlMs: integerEnv("SELECTION_TTL_MS", 30 * 60 * 1000),
  maxSelectedCoins: integerEnv("MAX_SELECTED_COINS", 20),
  maxOutputDurationSeconds: integerEnv("MAX_OUTPUT_DURATION_SECONDS", 120),
  processTimeoutMs: integerEnv("PROCESS_TIMEOUT_MS", 15 * 60 * 1000),
  hudEnabled: booleanEnv("HUD_ENABLED", true),
  minimapEnabled: booleanEnv("MINIMAP_ENABLED", true),
  eventFeedEnabled: booleanEnv("EVENT_FEED_ENABLED", true),
  nextItemEnabled: booleanEnv("NEXT_ITEM_ENABLED", true),
  mapRangeMeters: decimalEnv("MAP_RANGE_METERS", 150),
  eventFeedDurationSeconds: decimalEnv("EVENT_FEED_DURATION_SECONDS", 4),
  eventFeedMaxItems: integerEnv("EVENT_FEED_MAX_ITEMS", 3),
  hudFrameRate: integerEnv("HUD_FRAME_RATE", 10),
  showLegacyCoinOverlay: booleanEnv("SHOW_LEGACY_COIN_OVERLAY", false),
  fitSampleGapWarningSeconds: decimalEnv("FIT_SAMPLE_GAP_WARNING_SECONDS", 30),
  worldQueryPaddingMeters: decimalEnv("WORLD_QUERY_PADDING_METERS", 500)
};
