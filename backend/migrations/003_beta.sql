-- Private beta: invite codes, tester registry, and an auditable ledger for every
-- credit movement. All amounts are stored in base units; nothing here can mint
-- new test-USDC, it only records and rate-limits transfers from the beta float.

CREATE TABLE IF NOT EXISTS beta_invites (
  code         TEXT PRIMARY KEY,
  label        TEXT,
  max_claims   INTEGER NOT NULL DEFAULT 1 CHECK (max_claims >= 1),
  claim_count  INTEGER NOT NULL DEFAULT 0 CHECK (claim_count >= 0),
  starter_sol  NUMERIC(18, 9) NOT NULL DEFAULT 0.25,
  starter_usdc NUMERIC(18, 6) NOT NULL DEFAULT 25,
  revoked      BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beta_testers (
  wallet        TEXT PRIMARY KEY,
  invite_code   TEXT REFERENCES beta_invites(code),
  privy_user_id TEXT,
  claimed_at    TIMESTAMPTZ,
  blocked       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS beta_testers_invite_idx ON beta_testers (invite_code);

CREATE TABLE IF NOT EXISTS beta_ledger (
  id              BIGSERIAL PRIMARY KEY,
  wallet          TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('STARTER_GRANT', 'SWAP')),
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
  sol_lamports    BIGINT NOT NULL DEFAULT 0,
  usdc_base_units BIGINT NOT NULL DEFAULT 0,
  usdc_mint       TEXT NOT NULL,
  tx_signature    TEXT,
  error           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS beta_ledger_wallet_idx ON beta_ledger (wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS beta_ledger_day_idx ON beta_ledger (kind, created_at DESC);

-- A wallet can hold at most one STARTER_GRANT that is not marked failed. That is
-- the hard guarantee against a double claim, even if the HTTP request retries.
CREATE UNIQUE INDEX IF NOT EXISTS beta_ledger_one_starter_grant
  ON beta_ledger (wallet)
  WHERE kind = 'STARTER_GRANT' AND status <> 'FAILED';
