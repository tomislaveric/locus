import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOverpassQuery,
  germanyOverpassRegions,
  ingestOverpass,
  type OverpassRegion
} from "./overpass.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

const region = (id: string, west: number): OverpassRegion => ({
  id,
  stateId: "test-state",
  stateName: "Test State",
  south: 48,
  west,
  north: 49,
  east: west + 1
});

const response = (elements: unknown[], status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify({ version: 0.6, generator: "fixture", elements }), { status, headers });

const fixture = async (name: string): Promise<string> =>
  readFile(`fixtures/osm-wikidata/${name}`, "utf8");

describe("Overpass query tiling", () => {
  it("generates deterministic bounded state tiles and exact source selectors", () => {
    const regions = germanyOverpassRegions();
    expect(regions.length).toBeGreaterThan(80);
    expect(regions.length).toBeLessThan(200);
    expect(new Set(regions.map((item) => item.id)).size).toBe(regions.length);
    expect(regions).toEqual(germanyOverpassRegions());

    const query = buildOverpassQuery(regions[0]);
    expect(query).toContain('area["ISO3166-1"="DE"]');
    expect(query).toContain('nwr["tourism"="viewpoint"]');
    expect(query).toContain('nwr["natural"="peak"]');
    expect(query).toContain('nwr["historic"="castle"]');
    expect(query).toContain('nwr["waterway"="waterfall"]');
    expect(query).toContain("out tags center geom;");
    expect(query).not.toContain('["tourism"]');
  });
});

describe("Overpass ingestion", () => {
  it("converts geometry, rejects malformed objects, deduplicates overlaps, and replays cache", async () => {
    const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "staza-overpass-"));
    temporaryDirectories.push(cacheDirectory);
    const regions = [region("tile-a", 8), region("tile-b", 8.5)];
    const rawResponses = [
      await fixture("overpass-tile-a.json"),
      await fixture("overpass-tile-b.json")
    ];
    let calls = 0;
    const first = await ingestOverpass({
      endpoint: "https://overpass.example/api/interpreter",
      cacheDirectory,
      regions,
      fetcher: async () => {
        const rawResponse = rawResponses[calls];
        calls += 1;
        return new Response(rawResponse, { status: 200 });
      },
      now: () => new Date("2026-10-01T10:00:00.000Z")
    });

    expect(calls).toBe(2);
    expect(first.records.map((item) => `${item.osmType}:${item.osmId}`)).toEqual([
      "node:1", "node:5", "relation:3", "way:2"
    ]);
    expect(first.records.find((item) => item.osmId === "1")?.tags).not.toHaveProperty("source:note");
    const castle = first.records.find((item) => item.osmId === "2");
    expect(castle?.latitude).toBeCloseTo(48.3);
    expect(castle?.longitude).toBeCloseTo(8.3);
    expect(first.rejected).toEqual([
      expect.objectContaining({ osmType: "way", osmId: "4" })
    ]);
    expect(first.metadata).toMatchObject({
      coverageComplete: true,
      requestedRegions: 2,
      completedRegions: 2,
      fetchedRegions: 2,
      cacheHits: 0,
      duplicateObjects: 1,
      scanned: 5
    });

    const replay = await ingestOverpass({
      endpoint: "https://overpass.example/api/interpreter",
      cacheDirectory,
      regions,
      fetcher: async () => {
        throw new Error("cache replay must not fetch");
      }
    });
    expect(replay.records).toEqual(first.records);
    expect(replay.metadata).toMatchObject({
      coverageComplete: true,
      cacheHits: 2,
      fetchedRegions: 0
    });
  });

  it("retries transient failures and honors Retry-After", async () => {
    const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "staza-overpass-retry-"));
    temporaryDirectories.push(cacheDirectory);
    const delays: number[] = [];
    let calls = 0;
    const result = await ingestOverpass({
      endpoint: "https://overpass.example/api/interpreter",
      cacheDirectory,
      regions: [region("tile-retry", 8)],
      fetcher: async () => {
        calls += 1;
        if (calls === 1) return new Response("busy", { status: 429, headers: { "retry-after": "2" } });
        return response([{
          type: "node",
          id: 1,
          lat: 48.1,
          lon: 8.1,
          tags: { tourism: "viewpoint", name: "Lookout" }
        }]);
      },
      sleeper: async (milliseconds) => {
        delays.push(milliseconds);
      },
      random: () => 0,
      now: () => new Date("2026-10-01T10:00:00.000Z")
    });
    expect(calls).toBe(2);
    expect(delays).toEqual([2000]);
    expect(result.metadata.coverageComplete).toBe(true);
    expect(result.records).toHaveLength(1);
  });

  it("retries responses marked incomplete and never stores the partial payload", async () => {
    const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "staza-overpass-incomplete-"));
    temporaryDirectories.push(cacheDirectory);
    const incomplete = await fixture("overpass-incomplete.json");
    const complete = await fixture("overpass-tile-b.json");
    let calls = 0;
    const first = await ingestOverpass({
      endpoint: "https://overpass.example/api/interpreter",
      cacheDirectory,
      regions: [region("tile-incomplete", 8)],
      fetcher: async () => {
        calls += 1;
        return new Response(calls === 1 ? incomplete : complete, { status: 200 });
      },
      sleeper: async () => undefined,
      random: () => 0
    });
    expect(calls).toBe(2);
    expect(first.records.map((item) => item.osmId)).toEqual(["1", "5"]);

    const replay = await ingestOverpass({
      endpoint: "https://overpass.example/api/interpreter",
      cacheDirectory,
      regions: [region("tile-incomplete", 8)],
      fetcher: async () => {
        throw new Error("validated complete response should be cached");
      }
    });
    expect(replay.records.map((item) => item.osmId)).toEqual(["1", "5"]);
  });

  it("uses a validated stale cache on refresh failure and reports missing regions otherwise", async () => {
    const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "staza-overpass-stale-"));
    temporaryDirectories.push(cacheDirectory);
    const cachedRegion = region("tile-cached", 8);
    await ingestOverpass({
      endpoint: "https://overpass.example/api/interpreter",
      cacheDirectory,
      regions: [cachedRegion],
      fetcher: async () => response([{
        type: "node",
        id: 1,
        lat: 48.1,
        lon: 8.1,
        tags: { tourism: "viewpoint", name: "Lookout" }
      }])
    });

    const stale = await ingestOverpass({
      endpoint: "https://overpass.example/api/interpreter",
      cacheDirectory,
      regions: [cachedRegion],
      refresh: true,
      maxAttempts: 1,
      fetcher: async () => new Response("unavailable", { status: 503 })
    });
    expect(stale.metadata).toMatchObject({
      coverageComplete: true,
      cacheHits: 1,
      staleFallbackRegions: 1
    });

    const incomplete = await ingestOverpass({
      endpoint: "https://overpass.example/api/interpreter",
      cacheDirectory,
      regions: [region("tile-missing", 10)],
      maxAttempts: 1,
      fetcher: async () => new Response("unavailable", { status: 503 })
    });
    expect(incomplete.records).toEqual([]);
    expect(incomplete.metadata.coverageComplete).toBe(false);
    expect(incomplete.metadata.failedRegions).toEqual([
      expect.objectContaining({ regionId: "tile-missing", attempts: 1 })
    ]);
  });
});
