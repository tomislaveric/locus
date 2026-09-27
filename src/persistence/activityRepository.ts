import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  Activity,
  ActivityHistoryItem,
  ActivityResult,
  PersistedActivity,
  PersistedActivityEvent,
  PlayerProgress,
  ReplaySnapshot
} from "../domain.js";
import { getLevelProgress } from "../progression.js";

interface ActivityRow {
  id: string;
  started_at: Date;
  distance_meters: number | null;
  duration_seconds: number | null;
  xp_earned: number;
  collected_count: number;
  has_video: boolean;
  replay_snapshot: ReplaySnapshot | null;
}

interface EventRow {
  id: string;
  source_id: string;
  event_type: PersistedActivityEvent["type"];
  activity_timestamp: string | number;
  value: number;
  latitude: number;
  longitude: number;
  collectible_name: string;
  collectible_rarity: PersistedActivityEvent["collectible"]["rarity"] | null;
  collectible_type: PersistedActivityEvent["collectible"]["type"];
}

const mapActivity = (row: ActivityRow): ActivityHistoryItem => ({
  id: row.id,
  startedAt: row.started_at.toISOString(),
  ...(row.distance_meters === null ? {} : { distanceMeters: row.distance_meters }),
  ...(row.duration_seconds === null ? {} : { durationSeconds: row.duration_seconds }),
  xpEarned: row.xp_earned,
  collectedCount: row.collected_count,
  hasVideo: row.has_video
});

const createReplaySnapshot = (activity: Activity, activityResult: ActivityResult): ReplaySnapshot => ({
  version: 1,
  activity: structuredClone(activity),
  activityResult: structuredClone(activityResult)
});

const mapEvent = (row: EventRow): PersistedActivityEvent => ({
  id: row.id,
  sourceId: row.source_id,
  type: row.event_type,
  collectible: {
    name: row.collectible_name,
    type: row.collectible_type,
    ...(row.collectible_rarity === null ? {} : { rarity: row.collectible_rarity })
  },
  value: row.value,
  latitude: row.latitude,
  longitude: row.longitude,
  activityTimestamp: Number(row.activity_timestamp)
});

export class ActivityRepository {
  constructor(
    private readonly pool: Pool,
    private readonly defaultPlayerId: string,
    private readonly defaultPlayerName: string
  ) {}

  async initializeDefaultPlayer(): Promise<void> {
    await this.pool.query(
      `INSERT INTO players (id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [this.defaultPlayerId, this.defaultPlayerName]
    );
  }

  async persistCompletedActivity(
    activity: Activity,
    result: ActivityResult
  ): Promise<{ activity: PersistedActivity; progress: PlayerProgress; inserted: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<ActivityRow>(
        `INSERT INTO activities (
          id, player_id, source_type, started_at, distance_meters, duration_seconds, xp_earned, collected_count,
          replay_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
        RETURNING id, started_at, distance_meters, duration_seconds, xp_earned, collected_count, has_video, replay_snapshot`,
        [
          activity.id,
          this.defaultPlayerId,
          activity.source,
          new Date(activity.startedAt),
          activity.distance ?? null,
          activity.duration ?? null,
          result.totalPoints,
          result.collectedCount,
          JSON.stringify(createReplaySnapshot(activity, result))
        ]
      );

      if (inserted.rowCount === 0) {
        const persisted = await this.getActivityWithClient(client, activity.id);
        const progress = await this.getProgressWithClient(client);
        await client.query("COMMIT");
        return { activity: persisted, progress, inserted: false };
      }

      for (const event of result.events) {
        await client.query(
          `INSERT INTO activity_events (
            id, activity_id, source_id, event_type, activity_timestamp, value, latitude, longitude,
            collectible_name, collectible_rarity, collectible_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            randomUUID(),
            activity.id,
            event.sourceId,
            event.type,
            event.activityTimestamp,
            event.value,
            event.latitude,
            event.longitude,
            event.collectible.name,
            event.collectible.rarity ?? null,
            event.collectible.type
          ]
        );
      }
      const player = await client.query<{ total_xp: number }>(
        "UPDATE players SET total_xp = total_xp + $1 WHERE id = $2 RETURNING total_xp",
        [result.totalPoints, this.defaultPlayerId]
      );
      if (player.rowCount !== 1) throw new Error("Default player does not exist.");
      const persisted = await this.getActivityWithClient(client, activity.id);
      await client.query("COMMIT");
      return { activity: persisted, progress: getLevelProgress(player.rows[0].total_xp), inserted: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listActivities(): Promise<ActivityHistoryItem[]> {
    const result = await this.pool.query<ActivityRow>(
      `SELECT id, started_at, distance_meters, duration_seconds, xp_earned, collected_count, has_video, replay_snapshot
       FROM activities WHERE player_id = $1 ORDER BY created_at DESC, id DESC`,
      [this.defaultPlayerId]
    );
    return result.rows.map(mapActivity);
  }

  async getActivity(id: string): Promise<PersistedActivity | undefined> {
    const client = await this.pool.connect();
    try {
      return await this.getActivityWithClient(client, id);
    } catch (error) {
      if (error instanceof Error && error.message === "Activity not found.") return undefined;
      throw error;
    } finally {
      client.release();
    }
  }

  async getProgress(): Promise<PlayerProgress> {
    const result = await this.pool.query<{ total_xp: number }>(
      "SELECT total_xp FROM players WHERE id = $1",
      [this.defaultPlayerId]
    );
    if (result.rowCount !== 1) throw new Error("Default player does not exist.");
    return getLevelProgress(result.rows[0].total_xp);
  }

  async markActivityHasVideo(id: string): Promise<void> {
    const result = await this.pool.query(
      "UPDATE activities SET has_video = true WHERE id = $1 AND player_id = $2",
      [id, this.defaultPlayerId]
    );
    if (result.rowCount !== 1) throw new Error("Persisted activity not found.");
  }

  private async getProgressWithClient(client: PoolClient): Promise<PlayerProgress> {
    const result = await client.query<{ total_xp: number }>(
      "SELECT total_xp FROM players WHERE id = $1",
      [this.defaultPlayerId]
    );
    if (result.rowCount !== 1) throw new Error("Default player does not exist.");
    return getLevelProgress(result.rows[0].total_xp);
  }

  private async getActivityWithClient(client: PoolClient, id: string): Promise<PersistedActivity> {
    const activityResult = await client.query<ActivityRow>(
      `SELECT id, started_at, distance_meters, duration_seconds, xp_earned, collected_count, has_video, replay_snapshot
       FROM activities WHERE id = $1 AND player_id = $2`,
      [id, this.defaultPlayerId]
    );
    if (activityResult.rowCount !== 1) throw new Error("Activity not found.");
    const events = await client.query<EventRow>(
      `SELECT id, source_id, event_type, activity_timestamp, value, latitude, longitude,
              collectible_name, collectible_rarity, collectible_type
       FROM activity_events WHERE activity_id = $1 ORDER BY activity_timestamp, id`,
      [id]
    );
    return {
      ...mapActivity(activityResult.rows[0]),
      events: events.rows.map(mapEvent),
      ...(activityResult.rows[0].replay_snapshot === null ? {} : { replay: activityResult.rows[0].replay_snapshot })
    };
  }
}
