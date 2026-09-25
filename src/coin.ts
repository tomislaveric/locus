import { readFile } from "node:fs/promises";
import type { Coin } from "./domain.js";
import { UserInputError } from "./errors.js";

export const readCoins = async (file: string): Promise<Coin[]> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UserInputError(`Coin configuration could not be read: ${message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new UserInputError("Coin configuration must be a nonempty list of coins.");
  }
  if (!parsed.every(isCoin)) {
    throw new UserInputError("Every coin must contain id, latitude, longitude, radius_m, and value.");
  }
  if (parsed.some((coin) => coin.radius_m < 5)) {
    throw new UserInputError("Every coin radius_m must be at least 5.");
  }
  const ids = new Set(parsed.map((coin) => coin.id));
  if (ids.size !== parsed.length) {
    throw new UserInputError("Coin configuration contains duplicate ids.");
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
