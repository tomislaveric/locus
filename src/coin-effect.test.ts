import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCoinEffectAssets } from "./coin-effect.js";

describe("createCoinEffectAssets", () => {
  it("writes separate transparent assets for a multi-digit reward", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "post-ride-ar-effect-"));
    const assets = await createCoinEffectAssets(path.join(directory, "coin"), 1023456789);
    expect(new Set(Object.values(assets)).size).toBe(3);
    await expect(readFile(assets.reward)).resolves.toEqual(expect.objectContaining({ 1: 80, 2: 78, 3: 71 }));
  });
});
