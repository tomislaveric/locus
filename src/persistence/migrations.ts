import type { PoolClient } from "pg";

export interface Migration {
  id: string;
  up(client: PoolClient): Promise<void>;
}

export const migrations: Migration[] = [{
  id: "001_initial_player_activities",
  async up(client) {
    await client.query(`
      CREATE TABLE players (
        id UUID PRIMARY KEY,
        display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
        total_xp DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE activities (
        id TEXT PRIMARY KEY,
        player_id UUID NOT NULL REFERENCES players(id),
        source_type TEXT NOT NULL CHECK (source_type = 'fit'),
        source_external_id TEXT,
        started_at TIMESTAMPTZ NOT NULL,
        distance_meters DOUBLE PRECISION CHECK (distance_meters IS NULL OR distance_meters >= 0),
        duration_seconds DOUBLE PRECISION CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
        xp_earned DOUBLE PRECISION NOT NULL CHECK (xp_earned >= 0),
        collected_count INTEGER NOT NULL CHECK (collected_count >= 0),
        has_video BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX activities_player_source_external_id_unique
        ON activities (player_id, source_type, source_external_id)
        WHERE source_external_id IS NOT NULL;
      CREATE INDEX activities_player_created_at_index
        ON activities (player_id, created_at DESC, id DESC);
      CREATE TABLE activity_events (
        id UUID PRIMARY KEY,
        activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type = 'collectible_collected'),
        activity_timestamp DOUBLE PRECISION NOT NULL,
        value DOUBLE PRECISION NOT NULL CHECK (value >= 0),
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        collectible_name TEXT NOT NULL CHECK (length(trim(collectible_name)) > 0),
        collectible_rarity TEXT CHECK (collectible_rarity IS NULL OR collectible_rarity IN ('common', 'rare', 'epic')),
        collectible_type TEXT NOT NULL CHECK (collectible_type IN ('coin', 'landmark')),
        UNIQUE (activity_id, source_id)
      );
      CREATE INDEX activity_events_activity_timestamp_index
        ON activity_events (activity_id, activity_timestamp, id);
    `);
  }
}, {
  id: "002_activity_event_fractional_timestamps",
  async up(client) {
    await client.query(`
      ALTER TABLE activity_events
        ALTER COLUMN activity_timestamp TYPE DOUBLE PRECISION
        USING activity_timestamp::DOUBLE PRECISION
    `);
  }
}, {
  id: "003_activity_replay_snapshots",
  async up(client) {
    await client.query(`
      ALTER TABLE activities
        ADD COLUMN replay_snapshot JSONB
    `);
  }
}];
