CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SCHEDULED', 'LIVE', 'COMPLETED', 'ABORTED')),
  white_profile JSONB NOT NULL,
  black_profile JSONB NOT NULL,
  engine_settings JSONB NOT NULL,
  initial_fen TEXT NOT NULL,
  current_fen TEXT NOT NULL,
  pgn TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT '*',
  termination_reason TEXT,
  current_ply INTEGER NOT NULL DEFAULT 0 CHECK (current_ply >= 0),
  white_clock_ms BIGINT NOT NULL CHECK (white_clock_ms >= 0),
  black_clock_ms BIGINT NOT NULL CHECK (black_clock_ms >= 0),
  increment_ms INTEGER NOT NULL DEFAULT 0 CHECK (increment_ms >= 0),
  market_address TEXT UNIQUE,
  vault_address TEXT,
  market_lock_time TIMESTAMPTZ,
  transcript_hash TEXT,
  transcript_version SMALLINT NOT NULL DEFAULT 1,
  runner_lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_moves (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  ply INTEGER NOT NULL CHECK (ply > 0),
  uci TEXT NOT NULL,
  san TEXT NOT NULL,
  fen TEXT NOT NULL,
  pgn TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('WHITE', 'BLACK')),
  piece TEXT NOT NULL,
  captured TEXT,
  promotion TEXT,
  is_check BOOLEAN NOT NULL DEFAULT FALSE,
  is_checkmate BOOLEAN NOT NULL DEFAULT FALSE,
  eval_centipawns INTEGER,
  time_spent_ms BIGINT NOT NULL CHECK (time_spent_ms >= 0),
  white_clock_ms BIGINT NOT NULL CHECK (white_clock_ms >= 0),
  black_clock_ms BIGINT NOT NULL CHECK (black_clock_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, ply)
);

CREATE TABLE IF NOT EXISTS match_events (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, sequence),
  UNIQUE (match_id, event_hash)
);

CREATE TABLE IF NOT EXISTS market_commands (
  id BIGSERIAL PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL CHECK (command_type IN ('CREATE', 'LOCK', 'SETTLE', 'CANCEL')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AWAITING_SIGNATURE', 'SUBMITTED', 'CONFIRMED', 'FAILED')),
  transaction_signature TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS match_events_match_sequence_idx ON match_events(match_id, sequence);
CREATE INDEX IF NOT EXISTS market_commands_ready_idx ON market_commands(status, available_at);
