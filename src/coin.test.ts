import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCoins } from "./coin.js";
import { UserInputError } from "./errors.js";

const writeConfig = async (contents: unknown): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "post-ride-ar-coins-"));
  const file = path.join(directory, "coins.json");
  await writeFile(file, JSON.stringify(contents));
  return file;
};

describe("readCoins", () => {
  it("reads a valid list of uniquely identified coins", async () => {
    const coins = await readCoins(
      await writeConfig([
        { id: "one", latitude: 48, longitude: 11, radius_m: 5, value: 100 },
        { id: "two", latitude: 49, longitude: 12, radius_m: 10, value: 200 }
      ])
    );

    expect(coins.map((coin) => coin.id)).toEqual(["one", "two"]);
  });

  it("rejects empty lists", async () => {
    await expect(readCoins(await writeConfig([]))).rejects.toThrow(UserInputError);
  });

  it("rejects coins below the minimum radius", async () => {
    await expect(
      readCoins(await writeConfig([{ id: "one", latitude: 48, longitude: 11, radius_m: 4, value: 100 }]))
    ).rejects.toThrow(UserInputError);
  });

  it("rejects duplicate ids", async () => {
    await expect(
      readCoins(
        await writeConfig([
          { id: "one", latitude: 48, longitude: 11, radius_m: 5, value: 100 },
          { id: "one", latitude: 49, longitude: 12, radius_m: 5, value: 200 }
        ])
      )
    ).rejects.toThrow(UserInputError);
  });
});
