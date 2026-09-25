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

export const config = {
  port: integerEnv("PORT", 3000),
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data/jobs"),
  coinsFile: path.resolve(process.env.COINS_FILE ?? "./coins.json"),
  maxUploadBytes: integerEnv("MAX_UPLOAD_BYTES", 1024 * 1024 * 1024),
  jobTtlMs: integerEnv("JOB_TTL_MS", 30 * 60 * 1000),
  processTimeoutMs: integerEnv("PROCESS_TIMEOUT_MS", 5 * 60 * 1000)
};
