import type { Pool } from "pg";
import type { Collectible, CollectibleRarity, CollectibleType } from "../domain.js";
import type { GeoBounds } from "../worldQuery.js";
import { boundsCenter, splitBoundsAtAntimeridian } from "../worldQuery.js";

interface CollectibleRow {
  id: string;
  name: string;
  collectible_type: CollectibleType;
  rarity: CollectibleRarity | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  value: number;
  description: string | null;
}

const mapCollectible = (row: CollectibleRow): Collectible => ({
  id: row.id,
  name: row.name,
  type: row.collectible_type,
  latitude: row.latitude,
  longitude: row.longitude,
  radiusMeters: row.radius_meters,
  value: row.value,
  ...(row.rarity === null ? {} : { rarity: row.rarity }),
  ...(row.description === null ? {} : { description: row.description })
});

const SELECT_COLUMNS =
  "id, name, collectible_type, rarity, latitude, longitude, radius_meters, value, description";

export class CollectibleRepository {
  constructor(private readonly pool: Pool) {}

  async listAll(): Promise<Collectible[]> {
    const result = await this.pool.query<CollectibleRow>(
      `SELECT ${SELECT_COLUMNS} FROM collectibles ORDER BY id`
    );
    return result.rows.map(mapCollectible);
  }

  async listWithinBounds(bounds: GeoBounds, limit: number): Promise<{ collectibles: Collectible[]; truncated: boolean }> {
    const ranges = splitBoundsAtAntimeridian(bounds);
    const center = boundsCenter(bounds);
    const clauses = ranges.map((_range, index) => {
      const base = index * 2;
      return `(longitude >= $${base + 3} AND longitude <= $${base + 4})`;
    });
    const parameters: unknown[] = [bounds.minLatitude, bounds.maxLatitude];
    for (const range of ranges) parameters.push(range.minLongitude, range.maxLongitude);
    parameters.push(center.latitude, center.longitude, limit + 1);
    const centerLatitudeParameter = parameters.length - 2;
    const result = await this.pool.query<CollectibleRow>(
      `SELECT ${SELECT_COLUMNS} FROM collectibles
       WHERE latitude >= $1 AND latitude <= $2 AND (${clauses.join(" OR ")})
       ORDER BY (latitude - $${centerLatitudeParameter}) ^ 2 + (longitude - $${centerLatitudeParameter + 1}) ^ 2, id
       LIMIT $${parameters.length}`,
      parameters
    );
    const truncated = result.rows.length > limit;
    return { collectibles: result.rows.slice(0, limit).map(mapCollectible), truncated };
  }

  async listByIds(ids: string[]): Promise<Collectible[]> {
    if (ids.length === 0) return [];
    const result = await this.pool.query<CollectibleRow>(
      `SELECT ${SELECT_COLUMNS} FROM collectibles WHERE id = ANY($1::text[]) ORDER BY id`,
      [ids]
    );
    return result.rows.map(mapCollectible);
  }

  async upsertMany(collectibles: Collectible[]): Promise<number> {
    if (collectibles.length === 0) return 0;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const collectible of collectibles) {
        await client.query(
          `INSERT INTO collectibles (
            id, name, collectible_type, rarity, latitude, longitude, radius_meters, value, description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            collectible_type = EXCLUDED.collectible_type,
            rarity = EXCLUDED.rarity,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            radius_meters = EXCLUDED.radius_meters,
            value = EXCLUDED.value,
            description = EXCLUDED.description,
            updated_at = now()`,
          [
            collectible.id,
            collectible.name,
            collectible.type,
            collectible.rarity ?? null,
            collectible.latitude,
            collectible.longitude,
            collectible.radiusMeters,
            collectible.value,
            collectible.description ?? null
          ]
        );
      }
      await client.query("COMMIT");
      return collectibles.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
