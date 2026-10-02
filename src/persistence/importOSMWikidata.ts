import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { config } from "../config.js";
import { scoreCandidate } from "../osm/score.js";
import { formatOSMImportReport, planOSMImport } from "../osm/import.js";
import { normalizeOSMRecords, readOSMJsonLines, type RejectedOSMRecord } from "../osm/normalize.js";
import { ingestOverpass } from "../osm/overpass.js";
import { enrichCandidates, WikidataClient } from "../osm/wikidata.js";
import { createDatabasePool } from "./database.js";
import { migrate } from "./migrate.js";
import { CollectibleRepository } from "./collectibleRepository.js";

const temporaryDirectory = path.resolve("tmp/osm-wikidata", String(process.pid));

interface Arguments {
  dryRun: boolean;
  forceRefresh: boolean;
  refreshOSM: boolean;
  input?: string;
  metadata?: string;
  inspectionFile?: string;
}

const argumentsFrom = (values: string[]): Arguments => {
  const result: Arguments = { dryRun: false, forceRefresh: false, refreshOSM: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dry-run") result.dryRun = true;
    else if (value === "--force-refresh") result.forceRefresh = true;
    else if (value === "--refresh-osm") result.refreshOSM = true;
    else if (value === "--write-jsonl") result.inspectionFile = values[index + 1] && !values[index + 1].startsWith("--")
      ? values[++index]
      : path.join(temporaryDirectory, "inspection.jsonl");
    else if (value === "--input" || value === "--metadata") {
      const argument = values[++index];
      if (!argument || argument.startsWith("--")) throw new Error(`${value} requires a file path.`);
      if (value === "--input") result.input = path.resolve(argument);
      else result.metadata = path.resolve(argument);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  if (result.metadata && !result.input) throw new Error("--metadata requires --input.");
  return result;
};

const readMetadata = async (file: string | undefined, sourceUrl: string): Promise<Record<string, unknown>> => {
  if (!file) return { sourceUrl, coverageComplete: true };
  const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid OSM metadata JSON: ${file}`);
  }
  return parsed as Record<string, unknown>;
};

const inspectionPath = (file: string): string => {
  const root = path.resolve("tmp");
  const relative = path.relative(root, path.resolve(file));
  if (relative === "" || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error("JSONL inspection output must be written under ignored tmp/.");
  }
  return path.resolve(file);
};

const writeInspectionFile = async (
  target: string,
  scored: ReturnType<typeof scoreCandidate>[]
): Promise<void> => {
  await mkdir(path.dirname(target), { recursive: true });
  const rows = Readable.from((async function* () {
    for (const item of scored) {
      yield `${JSON.stringify({
        decision: item.decision,
        score: item.score,
        reasons: item.reasons,
        collectible: item.candidate
      })}\n`;
    }
  })());
  await pipeline(rows, createWriteStream(target, { encoding: "utf8", mode: 0o600 }));
};

const run = async (): Promise<void> => {
  const args = argumentsFrom(process.argv.slice(2));
  const sourceUrl = args.input ? "provided JSONL" : config.overpassApiUrl;
  let normalized: Awaited<ReturnType<typeof readOSMJsonLines>>;
  let metadata: Record<string, unknown>;
  let ingestionRejected: RejectedOSMRecord[] = [];
  if (args.input) {
    normalized = await readOSMJsonLines(args.input);
    metadata = await readMetadata(args.metadata, sourceUrl);
  } else {
    const ingestion = await ingestOverpass({
      endpoint: config.overpassApiUrl,
      cacheDirectory: path.resolve("data/osm-overpass-cache"),
      refresh: args.refreshOSM
    });
    normalized = normalizeOSMRecords(ingestion.records);
    ingestionRejected = ingestion.rejected;
    metadata = ingestion.metadata as unknown as Record<string, unknown>;
  }
  if (metadata.sourceUrl === undefined) metadata.sourceUrl = sourceUrl;
  const coverageComplete = metadata.coverageComplete !== false;

  const client = new WikidataClient({
    cacheDirectory: path.resolve("data/osm-wikidata-cache"),
    batchDelayMs: config.wikidataBatchDelayMs
  });
  const enriched = await enrichCandidates(normalized.candidates, client, { forceRefresh: args.forceRefresh });
  const scored = enriched.candidates.map(scoreCandidate);
  const rejected = [...ingestionRejected, ...normalized.rejected];
  const pool = createDatabasePool(config.databaseUrl ?? "");
  try {
    if (!args.dryRun && coverageComplete) await migrate(pool);
    const repository = new CollectibleRepository(pool);
    const existing = await repository.listAll();
    const plan = planOSMImport({
      scanned: Number(metadata.scanned ?? normalized.scanned),
      candidates: enriched.candidates,
      scored,
      rejected,
      existing,
      directQidCount: enriched.directQidCount,
      resolvedQidCount: enriched.resolvedQidCount,
      unmatchedQidCount: enriched.unmatchedQidCount,
      extractMetadata: metadata,
      coverageComplete
    });
    if (!args.dryRun && coverageComplete) {
      await repository.upsertMany([...plan.created, ...plan.updated]);
    }
    if (args.inspectionFile) {
      const target = inspectionPath(args.inspectionFile);
      await writeInspectionFile(target, scored);
      console.log(`Inspection JSONL: ${target}`);
    }
    console.log(formatOSMImportReport(plan, {
      dryRun: args.dryRun,
      sourceUrl: String(metadata.sourceUrl ?? sourceUrl),
      extractMetadata: metadata,
      writeBlocked: !args.dryRun && !coverageComplete
    }));
    if (!args.dryRun && !coverageComplete) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
};

if (!config.databaseUrl) throw new Error("DATABASE_URL is required.");
await run();
