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
}, {
  id: "004_activity_video_media",
  async up(client) {
    await client.query(`
      CREATE TABLE activity_videos (
        activity_id TEXT PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
        media_id UUID NOT NULL UNIQUE,
        source_filename TEXT NOT NULL CHECK (length(trim(source_filename)) > 0),
        source_path TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('syncing', 'sync_failed', 'awaiting_selection', 'rendering', 'succeeded', 'render_failed')),
        source_duration DOUBLE PRECISION CHECK (source_duration IS NULL OR source_duration >= 0),
        synchronization JSONB,
        mapped_events JSONB,
        selected_source_ids JSONB,
        render JSONB,
        output_path TEXT,
        output_filename TEXT,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }
}, {
  id: "005_activity_video_no_highlights",
  async up(client) {
    await client.query(`
      ALTER TABLE activity_videos DROP CONSTRAINT activity_videos_state_check;
      ALTER TABLE activity_videos ADD CONSTRAINT activity_videos_state_check
        CHECK (state IN ('syncing', 'sync_failed', 'no_highlights', 'awaiting_selection', 'rendering', 'succeeded', 'render_failed'));
    `);
  }
}, {
  id: "006_users_and_player_ownership",
  async up(client) {
    await client.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))),
        email_verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      );
      ALTER TABLE players ADD COLUMN user_id UUID REFERENCES users(id);
      CREATE UNIQUE INDEX players_user_id_unique ON players (user_id) WHERE user_id IS NOT NULL;
    `);
  }
}, {
  id: "007_auth_credentials_and_sessions",
  async up(client) {
    await client.query(`
      CREATE TABLE passkeys (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credential_id TEXT NOT NULL UNIQUE,
        public_key BYTEA NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        transports JSONB,
        device_type TEXT,
        backed_up BOOLEAN,
        name TEXT NOT NULL DEFAULT 'Passkey',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ
      );
      CREATE INDEX passkeys_user_id_index ON passkeys (user_id);
      CREATE TABLE auth_challenges (
        id UUID PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK (purpose IN ('passkey_registration', 'passkey_login', 'step_up')),
        challenge TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX auth_challenges_lookup_index ON auth_challenges (challenge, purpose, expires_at);
      CREATE TABLE email_codes (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login', 'step_up')),
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX email_codes_active_index ON email_codes (email, purpose, expires_at) WHERE used_at IS NULL;
      CREATE TABLE sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at TIMESTAMPTZ NOT NULL,
        absolute_expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        step_up_at TIMESTAMPTZ
      );
      CREATE INDEX sessions_active_token_index ON sessions (token_hash, expires_at) WHERE revoked_at IS NULL;
      CREATE INDEX sessions_user_id_index ON sessions (user_id) WHERE revoked_at IS NULL;
      CREATE TABLE security_events (
        id UUID PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE auth_rate_limits (
        scope TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        window_started_at TIMESTAMPTZ NOT NULL
      );
    `);
  }
}, {
  id: "008_account_lifecycle",
  async up(client) {
    await client.query(`
      CREATE TABLE deletion_intents (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        confirmation_token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE media_cleanup_tasks (
        id UUID PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        attempts INTEGER NOT NULL DEFAULT 0,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }
}, {
  id: "009_activity_type",
  async up(client) {
    await client.query(`
      ALTER TABLE activities
        ADD COLUMN activity_type TEXT NOT NULL DEFAULT 'unknown'
        CHECK (activity_type IN ('cycling', 'running', 'hiking', 'walking', 'unknown'));
    `);
  }
}];
