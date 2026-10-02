import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OSMRecord } from "./model.js";
import type { RejectedOSMRecord } from "./normalize.js";

export const OVERPASS_SOURCE_VERSION = "overpass-de-v1";

const QUERY_TIMEOUT_SECONDS = 180;
const DEFAULT_REQUEST_TIMEOUT_MS = 200_000;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_TILE_SPAN_DEGREES = 1;

const sourceClasses = [
  ["tourism", "viewpoint"],
  ["natural", "peak"],
  ["historic", "castle"],
  ["waterway", "waterfall"]
] as const;

const retainedTagKeys = new Set([
  "name", "name:de", "name:en", "wikidata", "wikipedia", "access", "foot",
  "highway", "ele", "prominence", "prominence:peak", "direction",
  "camera:direction", "observation", "castle_type", "tourism", "heritage",
  "heritage:operator", "historic", "natural", "waterway", "height", "website",
  "ref", "contact:website"
]);

interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface StateBounds extends BoundingBox {
  id: string;
  name: string;
}

export interface OverpassRegion extends BoundingBox {
  id: string;
  stateId: string;
  stateName: string;
}

const stateBounds: StateBounds[] = [
  { id: "baden-wuerttemberg", name: "Baden-Württemberg", south: 47.5, west: 7.4, north: 49.8, east: 10.5 },
  { id: "bavaria", name: "Bavaria", south: 47.2, west: 8.9, north: 50.6, east: 13.9 },
  { id: "berlin", name: "Berlin", south: 52.3, west: 13.0, north: 52.7, east: 13.8 },
  { id: "brandenburg", name: "Brandenburg", south: 51.3, west: 11.2, north: 53.6, east: 14.8 },
  { id: "bremen", name: "Bremen", south: 52.9, west: 8.4, north: 53.7, east: 9.0 },
  { id: "hamburg", name: "Hamburg", south: 53.3, west: 9.7, north: 53.8, east: 10.4 },
  { id: "hesse", name: "Hesse", south: 49.3, west: 7.7, north: 51.7, east: 10.3 },
  { id: "lower-saxony", name: "Lower Saxony", south: 51.2, west: 6.6, north: 53.9, east: 11.6 },
  { id: "mecklenburg-vorpommern", name: "Mecklenburg-Vorpommern", south: 53.0, west: 10.5, north: 54.8, east: 14.5 },
  { id: "north-rhine-westphalia", name: "North Rhine-Westphalia", south: 50.3, west: 5.8, north: 52.6, east: 9.5 },
  { id: "rhineland-palatinate", name: "Rhineland-Palatinate", south: 48.9, west: 6.1, north: 50.9, east: 8.6 },
  { id: "saarland", name: "Saarland", south: 49.1, west: 6.3, north: 49.7, east: 7.5 },
  { id: "saxony", name: "Saxony", south: 50.1, west: 11.8, north: 51.7, east: 15.1 },
  { id: "saxony-anhalt", name: "Saxony-Anhalt", south: 50.9, west: 10.5, north: 53.1, east: 13.2 },
  { id: "schleswig-holstein", name: "Schleswig-Holstein", south: 53.3, west: 7.8, north: 55.1, east: 11.4 },
  { id: "thuringia", name: "Thuringia", south: 50.2, west: 9.8, north: 51.7, east: 12.7 }
];

const roundCoordinate = (value: number): number => Number(value.toFixed(6));

export const germanyOverpassRegions = (
  tileSpanDegrees = DEFAULT_TILE_SPAN_DEGREES
): OverpassRegion[] => {
  if (!Number.isFinite(tileSpanDegrees) || tileSpanDegrees <= 0 || tileSpanDegrees > 2) {
    throw new Error("Overpass tile span must be greater than 0 and at most 2 degrees.");
  }
  const regions: OverpassRegion[] = [];
  for (const state of stateBounds) {
    const rows = Math.ceil((state.north - state.south) / tileSpanDegrees);
    const columns = Math.ceil((state.east - state.west) / tileSpanDegrees);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        regions.push({
          id: `${state.id}-${String(row + 1).padStart(2, "0")}-${String(column + 1).padStart(2, "0")}`,
          stateId: state.id,
          stateName: state.name,
          south: roundCoordinate(state.south + row * tileSpanDegrees),
          west: roundCoordinate(state.west + column * tileSpanDegrees),
          north: roundCoordinate(Math.min(state.north, state.south + (row + 1) * tileSpanDegrees)),
          east: roundCoordinate(Math.min(state.east, state.west + (column + 1) * tileSpanDegrees))
        });
      }
    }
  }
  return regions;
};

export const buildOverpassQuery = (region: OverpassRegion): string => {
  const bbox = `${region.south},${region.west},${region.north},${region.east}`;
  const selectors = sourceClasses.map(([key, value]) =>
    `  nwr["${key}"="${value}"](area.germany)(${bbox});`).join("\n");
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_SECONDS}];`,
    `area["ISO3166-1"="DE"]["boundary"="administrative"]["admin_level"="2"]->.germany;`,
    "(",
    selectors,
    ");",
    "out tags center geom;"
  ].join("\n");
};

interface OverpassCacheEntry {
  sourceVersion: string;
  region: OverpassRegion;
  endpoint: string;
  queryHash: string;
  cacheKey: string;
  fetchedAt: string;
  checksum: string;
  completionStatus: "complete";
  status: number;
  rawResponse: string;
}

interface RegionResult {
  entry: OverpassCacheEntry;
  cacheHit: boolean;
  staleFallback: boolean;
  refreshError?: string;
  attempts: number;
}

class OverpassRequestError extends Error {
  constructor(message: string, readonly attempts: number) {
    super(message);
  }
}

export interface OverpassFailure {
  regionId: string;
  stateName: string;
  attempts: number;
  error: string;
}

export interface OverpassIngestionMetadata {
  sourceUrl: string;
  sourceVersion: string;
  coverageComplete: boolean;
  requestedRegions: number;
  completedRegions: number;
  cacheHits: number;
  fetchedRegions: number;
  staleFallbackRegions: number;
  duplicateObjects: number;
  scanned: number;
  failedRegions: OverpassFailure[];
  regions: Array<{
    regionId: string;
    stateName: string;
    fetchedAt: string;
    checksum: string;
    cacheHit: boolean;
    staleFallback: boolean;
    refreshError?: string;
  }>;
}

export interface OverpassIngestionResult {
  records: OSMRecord[];
  rejected: RejectedOSMRecord[];
  metadata: OverpassIngestionMetadata;
}

export interface OverpassIngestionOptions {
  endpoint: string;
  cacheDirectory: string;
  refresh?: boolean;
  regions?: OverpassRegion[];
  fetcher?: typeof fetch;
  now?: () => Date;
  sleeper?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  requestTimeoutMs?: number;
  maxAttempts?: number;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const cacheIdentity = (region: OverpassRegion, query: string): { cacheKey: string; queryHash: string } => ({
  cacheKey: sha256(JSON.stringify({ sourceVersion: OVERPASS_SOURCE_VERSION, region, query })),
  queryHash: sha256(query)
});

const cacheFile = (
  directory: string,
  region: OverpassRegion,
  cacheKey: string
): string => path.join(directory, `${region.id}-${cacheKey.slice(0, 16)}.json`);

const validatedResponse = (rawResponse: string): Record<string, unknown> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    throw new Error("Overpass returned malformed JSON.");
  }
  const response = asRecord(parsed);
  if (!response || !Array.isArray(response.elements)) {
    throw new Error("Overpass response has no elements array.");
  }
  if (typeof response.remark === "string" && response.remark.trim()) {
    throw new Error(`Overpass response is incomplete: ${response.remark.trim()}`);
  }
  return response;
};

const readCache = async (
  directory: string,
  endpoint: string,
  region: OverpassRegion,
  query: string
): Promise<OverpassCacheEntry | undefined> => {
  const identity = cacheIdentity(region, query);
  try {
    const parsed = asRecord(JSON.parse(await readFile(cacheFile(directory, region, identity.cacheKey), "utf8")));
    if (!parsed ||
      parsed.sourceVersion !== OVERPASS_SOURCE_VERSION ||
      parsed.endpoint !== endpoint ||
      parsed.queryHash !== identity.queryHash ||
      parsed.cacheKey !== identity.cacheKey ||
      parsed.completionStatus !== "complete" ||
      typeof parsed.fetchedAt !== "string" ||
      typeof parsed.checksum !== "string" ||
      typeof parsed.status !== "number" ||
      typeof parsed.rawResponse !== "string" ||
      parsed.checksum !== sha256(parsed.rawResponse)) return undefined;
    validatedResponse(parsed.rawResponse);
    return parsed as unknown as OverpassCacheEntry;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
};

const writeCache = async (directory: string, entry: OverpassCacheEntry): Promise<void> => {
  await mkdir(directory, { recursive: true });
  const target = cacheFile(directory, entry.region, entry.cacheKey);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(entry, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, target);
};

const retryAfterMilliseconds = (value: string | null, now: Date): number | undefined => {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.min(Math.max(0, date - now.getTime()), 60_000);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const fetchRegion = async (
  options: Required<Pick<OverpassIngestionOptions,
    "fetcher" | "now" | "sleeper" | "random" | "requestTimeoutMs" | "maxAttempts">> &
    Pick<OverpassIngestionOptions, "endpoint">,
  region: OverpassRegion,
  query: string
): Promise<{ entry: OverpassCacheEntry; attempts: number }> => {
  let lastError = "Unknown Overpass error.";
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    let retryDelay: number | undefined;
    try {
      const response = await options.fetcher(options.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "Staza OSM collectible importer"
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(options.requestTimeoutMs)
      });
      if (!response.ok) {
        const transient = response.status === 429 || response.status >= 500;
        const detail = (await response.text()).trim().slice(0, 300);
        lastError = `HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
        if (!transient || attempt === options.maxAttempts) {
          const failure = new Error(lastError) as Error & { retryable?: boolean };
          failure.retryable = transient;
          throw failure;
        }
        retryDelay = retryAfterMilliseconds(response.headers.get("retry-after"), options.now());
      } else {
        const rawResponse = await response.text();
        validatedResponse(rawResponse);
        const fetchedAt = options.now().toISOString();
        const identity = cacheIdentity(region, query);
        return {
          attempts: attempt,
          entry: {
            sourceVersion: OVERPASS_SOURCE_VERSION,
            region,
            endpoint: options.endpoint,
            queryHash: identity.queryHash,
            cacheKey: identity.cacheKey,
            fetchedAt,
            checksum: sha256(rawResponse),
            completionStatus: "complete",
            status: response.status,
            rawResponse
          }
        };
      }
    } catch (error) {
      lastError = errorMessage(error);
      if ((error as Error & { retryable?: boolean }).retryable === false ||
        attempt === options.maxAttempts) throw new OverpassRequestError(lastError, attempt);
    }
    const exponential = Math.min(1000 * (2 ** (attempt - 1)), 30_000);
    const jitter = Math.floor(options.random() * 500);
    await options.sleeper(retryDelay ?? exponential + jitter);
  }
  throw new OverpassRequestError(lastError, options.maxAttempts);
};

const coordinates = (value: unknown): Array<{ latitude: number; longitude: number }> => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const point = asRecord(item);
    return typeof point?.lat === "number" && Number.isFinite(point.lat) &&
      typeof point.lon === "number" && Number.isFinite(point.lon) &&
      point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180
      ? [{ latitude: point.lat, longitude: point.lon }]
      : [];
  });
};

const polygonCentroid = (
  points: Array<{ latitude: number; longitude: number }>
): { latitude: number; longitude: number; area: number } | undefined => {
  if (points.length < 4) return undefined;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.latitude !== last.latitude || first.longitude !== last.longitude) return undefined;
  let crossSum = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    const cross = left.longitude * right.latitude - right.longitude * left.latitude;
    crossSum += cross;
    longitudeSum += (left.longitude + right.longitude) * cross;
    latitudeSum += (left.latitude + right.latitude) * cross;
  }
  if (Math.abs(crossSum) < 1e-12) return undefined;
  return {
    longitude: longitudeSum / (3 * crossSum),
    latitude: latitudeSum / (3 * crossSum),
    area: Math.abs(crossSum / 2)
  };
};

const lineMidpoint = (
  points: Array<{ latitude: number; longitude: number }>
): { latitude: number; longitude: number } | undefined => {
  if (points.length === 0) return undefined;
  if (points.length === 1) return points[0];
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index];
    const latitude = (point.latitude + previous.latitude) * Math.PI / 360;
    const x = (point.longitude - previous.longitude) * Math.cos(latitude);
    const y = point.latitude - previous.latitude;
    return Math.hypot(x, y);
  });
  let target = lengths.reduce((sum, length) => sum + length, 0) / 2;
  if (target === 0) return points[0];
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (target <= length) {
      const ratio = length === 0 ? 0 : target / length;
      return {
        latitude: points[index].latitude + ratio * (points[index + 1].latitude - points[index].latitude),
        longitude: points[index].longitude + ratio * (points[index + 1].longitude - points[index].longitude)
      };
    }
    target -= length;
  }
  return points[points.length - 1];
};

const explicitCenter = (element: Record<string, unknown>) => {
  const center = asRecord(element.center);
  return typeof center?.lat === "number" && Number.isFinite(center.lat) &&
    typeof center.lon === "number" && Number.isFinite(center.lon) &&
    center.lat >= -90 && center.lat <= 90 && center.lon >= -180 && center.lon <= 180
    ? { latitude: center.lat, longitude: center.lon }
    : undefined;
};

const representativePoint = (
  type: "node" | "way" | "relation",
  element: Record<string, unknown>
): { latitude: number; longitude: number } | undefined => {
  if (type === "node") {
    return typeof element.lat === "number" && Number.isFinite(element.lat) &&
      typeof element.lon === "number" && Number.isFinite(element.lon) &&
      element.lat >= -90 && element.lat <= 90 && element.lon >= -180 && element.lon <= 180
      ? { latitude: element.lat, longitude: element.lon }
      : undefined;
  }
  if (type === "way") {
    const points = coordinates(element.geometry);
    return polygonCentroid(points) ?? lineMidpoint(points) ?? explicitCenter(element);
  }
  const rings = Array.isArray(element.members)
    ? element.members.flatMap((member) => {
        const value = asRecord(member);
        if (value?.role !== "outer") return [];
        const centroid = polygonCentroid(coordinates(value.geometry));
        return centroid ? [centroid] : [];
      })
    : [];
  rings.sort((left, right) => right.area - left.area);
  return rings[0] ?? explicitCenter(element);
};

const filteredTags = (value: unknown): Record<string, string> => {
  const tags = asRecord(value);
  if (!tags) return {};
  return Object.fromEntries(Object.entries(tags).filter(([key, item]) =>
    typeof item === "string" && (retainedTagKeys.has(key) || key.startsWith("observation:"))
  )) as Record<string, string>;
};

const matchesSourceClass = (tags: Record<string, string>): boolean =>
  sourceClasses.some(([key, value]) => tags[key] === value);

const recordsFromResponse = (
  response: Record<string, unknown>
): { records: OSMRecord[]; rejected: RejectedOSMRecord[] } => {
  const records: OSMRecord[] = [];
  const rejected: RejectedOSMRecord[] = [];
  for (const rawElement of response.elements as unknown[]) {
    const element = asRecord(rawElement);
    const tags = filteredTags(element?.tags);
    if (!element || !matchesSourceClass(tags)) continue;
    const type = element.type;
    const osmId = typeof element.id === "number" && Number.isSafeInteger(element.id) && element.id > 0
      ? String(element.id)
      : "";
    if (type !== "node" && type !== "way" && type !== "relation") {
      rejected.push({ ...(osmId ? { osmId } : {}), reason: "Invalid Overpass OSM object type." });
      continue;
    }
    if (!osmId) {
      rejected.push({ osmType: type, reason: "Invalid Overpass OSM object id." });
      continue;
    }
    const point = representativePoint(type, element);
    if (!point) {
      rejected.push({
        osmType: type,
        osmId,
        reason: "OSM geometry is malformed or unavailable."
      });
      continue;
    }
    records.push({
      osmType: type,
      osmId,
      latitude: point.latitude,
      longitude: point.longitude,
      tags
    });
  }
  return { records, rejected };
};

export const ingestOverpass = async (
  input: OverpassIngestionOptions
): Promise<OverpassIngestionResult> => {
  const options = {
    fetcher: input.fetcher ?? fetch,
    now: input.now ?? (() => new Date()),
    sleeper: input.sleeper ?? ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds))),
    random: input.random ?? Math.random,
    requestTimeoutMs: input.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    endpoint: input.endpoint
  };
  const regions = input.regions ?? germanyOverpassRegions();
  const results: RegionResult[] = [];
  const failures: OverpassFailure[] = [];

  for (const region of regions) {
    const query = buildOverpassQuery(region);
    const cached = await readCache(input.cacheDirectory, input.endpoint, region, query);
    if (cached && !input.refresh) {
      results.push({ entry: cached, cacheHit: true, staleFallback: false, attempts: 0 });
      continue;
    }
    try {
      const fetched = await fetchRegion(options, region, query);
      await writeCache(input.cacheDirectory, fetched.entry);
      results.push({
        entry: fetched.entry,
        cacheHit: false,
        staleFallback: false,
        attempts: fetched.attempts
      });
    } catch (error) {
      if (cached) {
        const attempts = error instanceof OverpassRequestError ? error.attempts : options.maxAttempts;
        results.push({
          entry: cached,
          cacheHit: true,
          staleFallback: true,
          refreshError: errorMessage(error),
          attempts
        });
      } else {
        const attempts = error instanceof OverpassRequestError ? error.attempts : options.maxAttempts;
        failures.push({
          regionId: region.id,
          stateName: region.stateName,
          attempts,
          error: errorMessage(error)
        });
      }
    }
  }

  const byIdentity = new Map<string, OSMRecord>();
  const seenIdentities = new Set<string>();
  const rejected: RejectedOSMRecord[] = [];
  let duplicateObjects = 0;
  let scanned = 0;
  for (const result of results) {
    const parsed = recordsFromResponse(validatedResponse(result.entry.rawResponse));
    for (const rejection of parsed.rejected) {
      const identity = rejection.osmType && rejection.osmId
        ? `${rejection.osmType}:${rejection.osmId}`
        : undefined;
      if (identity && seenIdentities.has(identity)) {
        duplicateObjects += 1;
        continue;
      }
      if (identity) seenIdentities.add(identity);
      scanned += 1;
      rejected.push(rejection);
    }
    for (const record of parsed.records) {
      const identity = `${record.osmType}:${record.osmId}`;
      if (seenIdentities.has(identity)) {
        duplicateObjects += 1;
        continue;
      }
      seenIdentities.add(identity);
      scanned += 1;
      byIdentity.set(identity, record);
    }
  }

  return {
    records: [...byIdentity.values()].sort((left, right) =>
      `${left.osmType}:${left.osmId}`.localeCompare(`${right.osmType}:${right.osmId}`)),
    rejected,
    metadata: {
      sourceUrl: input.endpoint,
      sourceVersion: OVERPASS_SOURCE_VERSION,
      coverageComplete: failures.length === 0,
      requestedRegions: regions.length,
      completedRegions: results.length,
      cacheHits: results.filter((result) => result.cacheHit).length,
      fetchedRegions: results.filter((result) => !result.cacheHit).length,
      staleFallbackRegions: results.filter((result) => result.staleFallback).length,
      duplicateObjects,
      scanned,
      failedRegions: failures,
      regions: results.map((result) => ({
        regionId: result.entry.region.id,
        stateName: result.entry.region.stateName,
        fetchedAt: result.entry.fetchedAt,
        checksum: result.entry.checksum,
        cacheHit: result.cacheHit,
        staleFallback: result.staleFallback,
        ...(result.refreshError ? { refreshError: result.refreshError } : {})
      }))
    }
  };
};
