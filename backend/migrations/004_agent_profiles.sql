-- Engine roster. Profiles were previously a static JSON file; the admin console
-- can now create, edit, and retire Stockfish personas while the coordinator is
-- running. config/agent-profiles.json remains the seed and offline fallback.

CREATE TABLE IF NOT EXISTS agent_profiles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  handle     TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT 'White' CHECK (color IN ('White', 'Black')),
  engine     JSONB NOT NULL,
  opening    JSONB NOT NULL DEFAULT '{}'::jsonb,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_profiles_active_idx ON agent_profiles (active, created_at);
