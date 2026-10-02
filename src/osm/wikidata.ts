import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OSMCandidate } from "./model.js";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const BATCH_SIZE = 50;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  qid: string;
  fetchedAt: string;
  status: number;
  responseDate?: string;
  entity: Record<string, unknown>;
}

export interface WikidataLookup {
  qid: string;
  entity?: Record<string, unknown>;
  fetchedAt?: string;
  cacheHit?: boolean;
  error?: string;
  stale?: boolean;
}

export interface WikidataClientOptions {
  cacheDirectory: string;
  fetcher?: typeof fetch;
  now?: () => Date;
  maxAgeMs?: number;
  batchDelayMs?: number;
  sleeper?: (milliseconds: number) => Promise<void>;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const entityLabel = (entity: Record<string, unknown> | undefined): string | undefined => {
  const labels = asRecord(entity?.labels);
  for (const language of ["de", "en"]) {
    const label = asRecord(labels?.[language])?.value;
    if (typeof label === "string" && label.trim()) return label.trim();
  }
  return undefined;
};

const entityDescription = (entity: Record<string, unknown> | undefined): string | undefined => {
  const descriptions = asRecord(entity?.descriptions);
  for (const language of ["de", "en"]) {
    const description = asRecord(descriptions?.[language])?.value;
    if (typeof description === "string" && description.trim()) return description.trim();
  }
  return undefined;
};

const sitelinkMatch = (
  wikipedia: string | undefined,
  entity: Record<string, unknown> | undefined
): boolean => {
  if (!wikipedia) return false;
  const colon = wikipedia.indexOf(":");
  if (colon < 1) return false;
  const language = wikipedia.slice(0, colon).toLowerCase();
  const title = wikipedia.slice(colon + 1).replaceAll("_", " ").trim();
  if (!/^[a-z-]+$/i.test(language) || !title) return false;
  const sitelinks = asRecord(entity?.sitelinks);
  const sitelink = asRecord(sitelinks?.[`${language}wiki`]);
  return typeof sitelink?.title === "string" && sitelink.title.replaceAll("_", " ") === title;
};

const coordinateFromEntity = (
  entity: Record<string, unknown> | undefined
): { latitude: number; longitude: number } | undefined => {
  const claims = asRecord(entity?.claims);
  const statements = claims?.P625;
  if (!Array.isArray(statements) || statements.length === 0) return undefined;
  const mainsnak = asRecord(asRecord(statements[0])?.mainsnak);
  const value = asRecord(asRecord(mainsnak?.datavalue)?.value);
  const latitude = value?.latitude;
  const longitude = value?.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) ||
    typeof longitude !== "number" || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
};

const instanceOf = (entity: Record<string, unknown> | undefined): Set<string> => {
  const claims = asRecord(entity?.claims);
  const statements = claims?.P31;
  if (!Array.isArray(statements)) return new Set();
  const ids = statements.map((statement) => {
    const mainsnak = asRecord(asRecord(statement)?.mainsnak);
    const value = asRecord(asRecord(mainsnak?.datavalue)?.value);
    return value?.id;
  });
  return new Set(ids.filter((id): id is string => typeof id === "string"));
};

const incompatibleTypes: Record<string, Set<string>> = {
  castle: new Set(["Q8502", "Q34038"]),
  peak: new Set(["Q23413", "Q34038"]),
  waterfall: new Set(["Q23413", "Q8502"]),
  viewpoint: new Set(["Q23413", "Q8502", "Q34038"])
};

const haversineMeters = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number => {
  const radians = Math.PI / 180;
  const latitudeGap = (b.latitude - a.latitude) * radians;
  const longitudeGap = (b.longitude - a.longitude) * radians;
  const term = Math.sin(latitudeGap / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitudeGap / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
};

export class WikidataClient {
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly maxAgeMs: number;
  private readonly batchDelayMs: number;
  private readonly sleeper: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: WikidataClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.maxAgeMs = options.maxAgeMs ?? CACHE_MAX_AGE_MS;
    this.batchDelayMs = options.batchDelayMs ?? 1_000;
    if (!Number.isFinite(this.batchDelayMs) || this.batchDelayMs < 0) {
      throw new Error("Wikidata batch delay must be a non-negative number.");
    }
    this.sleeper = options.sleeper ?? ((milliseconds) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  }

  private cachePath(qid: string): string {
    return path.join(this.options.cacheDirectory, `${qid}.json`);
  }

  private async readCache(qid: string): Promise<CacheEntry | undefined> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.cachePath(qid), "utf8"));
      const entry = asRecord(parsed);
      if (entry?.qid !== qid || typeof entry.fetchedAt !== "string" ||
        typeof entry.status !== "number" || !asRecord(entry.entity)) return undefined;
      return entry as unknown as CacheEntry;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  private async writeCache(entry: CacheEntry): Promise<void> {
    await mkdir(this.options.cacheDirectory, { recursive: true });
    const file = this.cachePath(entry.qid);
    const temporary = `${file}.tmp`;
    await writeFile(temporary, `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, file);
  }

  async lookup(qids: string[], { forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<Map<string, WikidataLookup>> {
    const unique = [...new Set(qids)].filter((qid) => /^Q[1-9]\d*$/.test(qid)).sort();
    const output = new Map<string, WikidataLookup>();
    const misses: string[] = [];
    const stale = new Map<string, CacheEntry>();
    for (const qid of unique) {
      const cache = await this.readCache(qid);
      const age = cache ? this.now().getTime() - Date.parse(cache.fetchedAt) : Infinity;
      if (cache && !forceRefresh && Number.isFinite(age) && age >= 0 && age <= this.maxAgeMs) {
        output.set(qid, { qid, entity: cache.entity, fetchedAt: cache.fetchedAt, cacheHit: true });
      } else {
        misses.push(qid);
        if (cache) stale.set(qid, cache);
      }
    }

    for (let offset = 0; offset < misses.length; offset += BATCH_SIZE) {
      if (offset > 0 && this.batchDelayMs > 0) {
        await this.sleeper(this.batchDelayMs);
      }
      const batch = misses.slice(offset, offset + BATCH_SIZE);
      const url = new URL(WIKIDATA_API);
      url.search = new URLSearchParams({
        action: "wbgetentities",
        ids: batch.join("|"),
        props: "labels|descriptions|claims|sitelinks",
        languages: "de|en",
        sitefilter: "dewiki|enwiki",
        format: "json",
        formatversion: "2"
      }).toString();
      try {
        const response = await this.fetcher(url, {
          headers: { "User-Agent": "StazaCollectibleImporter/1.0 (maintenance script)" },
          signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) throw new Error(`Wikidata returned HTTP ${response.status}.`);
        const payload: unknown = await response.json();
        const entities = asRecord(asRecord(payload)?.entities);
        if (!entities) throw new Error("Wikidata response did not contain an entities object.");
        for (const qid of batch) {
          const entity = asRecord(entities[qid]);
          if (!entity || typeof entity.id !== "string" || entity.id !== qid) {
            output.set(qid, { qid, error: "Wikidata returned no matching entity." });
            continue;
          }
          const fetchedAt = this.now().toISOString();
          const entry: CacheEntry = {
            qid,
            fetchedAt,
            status: response.status,
            ...(response.headers.get("date") ? { responseDate: response.headers.get("date")! } : {}),
            entity
          };
          await this.writeCache(entry);
          output.set(qid, { qid, entity, fetchedAt, cacheHit: false });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Wikidata request failed.";
        for (const qid of batch) {
          const cached = stale.get(qid);
          output.set(qid, cached
            ? { qid, entity: cached.entity, fetchedAt: cached.fetchedAt, cacheHit: true, stale: true, error: message }
            : { qid, error: message });
        }
      }
    }
    return output;
  }
}

export const enrichCandidates = async (
  candidates: OSMCandidate[],
  client: WikidataClient,
  options: { forceRefresh?: boolean } = {}
): Promise<{ candidates: OSMCandidate[]; directQidCount: number; resolvedQidCount: number; unmatchedQidCount: number }> => {
  const qids = candidates.flatMap((candidate) => candidate.wikidataQid ? [candidate.wikidataQid] : []);
  const lookup = await client.lookup(qids, options);
  let resolvedQidCount = 0;
  let unmatchedQidCount = 0;
  const enriched = candidates.map((candidate) => {
    const qid = candidate.wikidataQid;
    if (!qid) return candidate;
    const result = lookup.get(qid) ?? { qid, error: "No Wikidata response was produced." };
    if (!result.entity) {
      unmatchedQidCount += 1;
      return {
        ...candidate,
        wikidataCompatible: false,
        enrichmentMetadata: { qid, state: "unresolved", error: result.error ?? "Missing Wikidata entity." }
      };
    }
    resolvedQidCount += 1;
    const label = entityLabel(result.entity);
    const reference = sitelinkMatch(candidate.wikipediaReference, result.entity);
    const qidTypes = instanceOf(result.entity);
    const typeCompatible = ![...qidTypes].some((id) => incompatibleTypes[candidate.primaryCategory].has(id));
    const wikidataCoordinates = coordinateFromEntity(result.entity);
    const coordinateCompatible = !wikidataCoordinates ||
      haversineMeters(candidate, wikidataCoordinates) <= 1_000;
    const wikipediaCompatible = !candidate.wikipediaReference || reference;
    return {
      ...candidate,
      ...(candidate.name === undefined && label ? { wikidataLabel: label } : {}),
      ...(label ? { wikidataEntityLabel: label } : {}),
      ...(entityDescription(result.entity) ? { wikidataDescription: entityDescription(result.entity) } : {}),
      ...(wikidataCoordinates ? { wikidataCoordinates } : {}),
      wikidataCompatible: typeCompatible && coordinateCompatible && wikipediaCompatible,
      wikipediaSitelinkMatched: reference,
      ...(reference ? { wikipediaReference: candidate.wikipediaReference } : {}),
      enrichmentMetadata: {
        qid,
        state: result.stale ? "stale-cache" : "resolved",
        fetchedAt: result.fetchedAt,
        ...(result.stale ? { refreshError: result.error } : {}),
        labelLanguage: entityLabel(result.entity) === asRecord(asRecord(result.entity.labels)?.de)?.value ? "de" : "en",
        wikipediaSitelinkMatched: reference,
        typeCompatible,
        coordinateCompatible,
        wikipediaCompatible
      }
    };
  });
  return { candidates: enriched, directQidCount: qids.length, resolvedQidCount, unmatchedQidCount };
};
