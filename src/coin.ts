import { readFile } from "node:fs/promises";
import type { Coin } from "./domain.js";
import { UserInputError } from "./errors.js";

export const readCoin = async (file: string): Promise<Coin> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UserInputError(`Coin configuration could not be read: ${message}`);
  }
  if (!isCoin(parsed)) {
    throw new UserInputError("Coin configuration must contain id, latitude, longitude, radius_m, and value.");
  }
  if (parsed.radius_m < 5) {
    throw new UserInputError("Coin radius_m must be at least 5.");
  }
  return parsed;
};

const isCoin = (value: unknown): value is Coin => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    ["latitude", "longitude", "radius_m", "value"].every(
      (key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key])
    )
  );
};
