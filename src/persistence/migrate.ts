import { config } from "../config.js";
import { createDatabasePool } from "./database.js";
import { migrations } from "./migrations.js";

export const migrate = async (pool: ReturnType<typeof createDatabasePool>): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
    const appliedIds = new Set(applied.rows.map((row) => row.id));
    for (const migration of migrations) {
      if (appliedIds.has(migration.id)) continue;
      await migration.up(client);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

if (process.argv[1]?.includes("migrate.")) {
  const databaseUrl = config.databaseUrl;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const pool = createDatabasePool(databaseUrl);
  await migrate(pool);
  await pool.end();
}
