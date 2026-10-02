import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalizeOSMJsonLines, normalizeOSMRecord } from "./normalize.js";
import { scoreCandidate } from "./score.js";

const candidate = (tags: Record<string, string>, id = "10") => {
  const result = normalizeOSMRecord({
    osmType: "node",
    osmId: id,
    latitude: 48,
    longitude: 8,
    tags
  });
  if (!result.ok) throw new Error(result.rejection.reason);
  return result.candidate;
};

describe("OSM normalization", () => {
  it("accepts only the four explicit source classes and applies category precedence", () => {
    const castle = normalizeOSMRecord({
      osmType: "way",
      osmId: "99",
      latitude: 48,
      longitude: 8,
      tags: { historic: "castle", natural: "peak", tourism: "viewpoint", name: "Schloss Sample", ele: "500 m" }
    });
    expect(castle.ok && castle.candidate.primaryCategory).toBe("castle");
    expect(castle.ok && castle.candidate.categories).toEqual(["castle", "peak", "viewpoint"]);
    expect(castle.ok && castle.candidate.tagsForCatalog).toEqual(["historic", "summit", "viewpoint"]);

    const viewpoint = normalizeOSMRecord({
      osmType: "node", osmId: "98", latitude: 48, longitude: 8,
      tags: { tourism: "viewpoint", name: "Lookout" }
    });
    expect(viewpoint.ok && viewpoint.candidate.tagsForCatalog).toEqual([]);

    expect(normalizeOSMRecord({
      osmType: "node", osmId: "1", latitude: 48, longitude: 8, tags: { tourism: "museum" }
    })).toMatchObject({ ok: false });
  });

  it("rejects invalid geometry, identity, Q-IDs, and unusable explicit names", () => {
    for (const record of [
      { osmType: "node", osmId: "0", latitude: 48, longitude: 8, tags: { natural: "peak" } },
      { osmType: "node", osmId: "2", latitude: 91, longitude: 8, tags: { natural: "peak" } },
      { osmType: "node", osmId: "3", latitude: 48, longitude: 8, tags: { natural: "peak", wikidata: "123" } },
      { osmType: "node", osmId: "4", latitude: 48, longitude: 8, tags: { natural: "peak", name: "Unnamed" } }
    ]) expect(normalizeOSMRecord(record)).toMatchObject({ ok: false });

    const unnamed = normalizeOSMRecord({
      osmType: "node", osmId: "5", latitude: 48, longitude: 8, tags: { natural: "peak" }
    });
    expect(unnamed.ok).toBe(true);
    if (unnamed.ok) expect(unnamed.candidate).not.toHaveProperty("name");
  });

  it("reports malformed JSON and duplicate OSM object identities without overriding the first", async () => {
    const fixture = await readFile("fixtures/osm-wikidata/candidates.jsonl", "utf8");
    const normalized = normalizeOSMJsonLines(fixture);
    expect(normalized.candidates.some((item) => item.id === "osm:node:1001")).toBe(true);
    expect(normalized.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: "Duplicate OSM source identity." }),
      expect.objectContaining({ reason: "Invalid representative coordinates." })
    ]));
    expect(normalizeOSMJsonLines("{not-json}\n").rejected[0].reason).toBe("Malformed JSONL record.");
  });
});

describe("explainable collectible scoring", () => {
  it("reproduces category score examples and every decision band", () => {
    const viewpointAuto = scoreCandidate({
      ...candidate({
      tourism: "viewpoint", name: "Turmberg", wikidata: "Q1", wikipedia: "de:Turmberg",
      foot: "yes", direction: "180"
      }),
      wikipediaSitelinkMatched: true
    });
    expect(viewpointAuto).toMatchObject({ score: 80, decision: "AUTO_PUBLISH" });

    const viewpointReview = scoreCandidate(candidate({
      tourism: "viewpoint", name: "Turmberg", wikidata: "Q1", foot: "yes", direction: "180"
    }));
    expect(viewpointReview).toMatchObject({ score: 60, decision: "REVIEW" });

    const peakAuto = scoreCandidate({
      ...candidate({
      natural: "peak", name: "Mount Gipfel", wikidata: "Q2", wikipedia: "de:Gipfel", access: "yes",
      prominence: "310", tourism: "viewpoint"
      }),
      wikipediaSitelinkMatched: true
    });
    expect(peakAuto).toMatchObject({ score: 95, decision: "AUTO_PUBLISH" });

    const peakReview = scoreCandidate(candidate({
      natural: "peak", name: "Mount Gipfel", access: "yes", prominence: "200", tourism: "viewpoint"
    }));
    expect(peakReview).toMatchObject({ score: 52, decision: "REVIEW" });

    const weak = scoreCandidate(candidate({ tourism: "viewpoint", direction: "120" }));
    expect(weak).toMatchObject({ score: 0, decision: "IGNORE" });
    expect(scoreCandidate(candidate({ tourism: "viewpoint", access: "private" })).decision).toBe("REJECT");

    const castleAuto = candidate({
      historic: "castle", name: "Castle Name", wikidata: "Q3", wikipedia: "de:Castle",
      access: "yes", castle_type: "manor", heritage: "4", tourism: "attraction"
    });
    expect(scoreCandidate({ ...castleAuto, wikipediaSitelinkMatched: true }).score).toBe(90);
    expect(scoreCandidate(candidate({
      historic: "castle", name: "Castle Name", wikidata: "Q3", access: "yes", castle_type: "manor"
    })).score).toBe(60);
    expect(scoreCandidate(candidate({
      historic: "castle", name: "Small Castle", heritage: "4"
    })).score).toBe(35);
    const waterfallAuto = candidate({
      waterway: "waterfall", name: "Tall Fall", wikidata: "Q4", wikipedia: "de:Fall",
      access: "yes", height: "10", website: "https://example.invalid"
    });
    expect(scoreCandidate({ ...waterfallAuto, wikipediaSitelinkMatched: true }).score).toBe(95);
    expect(scoreCandidate(candidate({
      waterway: "waterfall", name: "Small Fall", wikidata: "Q4", access: "yes", height: "10"
    })).score).toBe(65);
    expect(scoreCandidate(candidate({ waterway: "waterfall", height: "3" })).score).toBe(0);
  });

  it("does not award stacked elevation/prominence or score access-conflicted targets", () => {
    const peak = scoreCandidate(candidate({
      natural: "peak", name: "Mount Sample", ele: "1000", prominence: "120", access: "yes"
    }));
    expect(peak.score).toBe(47);
    expect(peak.reasons).toContain("Prominence 100-299 m: +12");
    expect(peak.reasons).not.toContain("Elevation only: +5");
    expect(scoreCandidate(candidate({
      natural: "peak", name: "Mount Sample", access: "yes", foot: "no"
    })).decision).toBe("REJECT");
  });
});
