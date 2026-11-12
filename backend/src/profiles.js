'use strict';

/*
 * Engine roster storage.
 *
 * Profiles are the real Stockfish personas that play in the arena. They live in
 * Postgres so the admin console can create and retire them while the
 * coordinator is running; config/agent-profiles.json remains the seed file and
 * the offline fallback for tests and CLI tooling.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROSTER_PATH = path.resolve(__dirname, '..', '..', 'config', 'agent-profiles.json');
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

function readSeedRoster(file = DEFAULT_ROSTER_PATH) {
  const roster = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(roster) || roster.length < 2) {
    throw new Error('agent-profiles.json must contain at least two engine profiles');
  }
  return roster;
}

function profileFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    color: row.color || 'White',
    engine: row.engine,
    opening: row.opening || { name: 'Stockfish', moves: [] },
    active: row.active !== false,
  };
}

function normalizeMoves(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((move) => (typeof move === 'string' ? move.trim().toLowerCase() : ''))
    .filter((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
    .slice(0, 24);
}

function parseProfile(body) {
  const id = typeof body?.id === 'string' ? body.id.trim().toLowerCase() : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const handle = typeof body?.handle === 'string'
    ? body.handle.trim().toLowerCase()
    : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  if (!ID_PATTERN.test(id)) {
    throw Object.assign(new Error('Profile id must be 3-64 lowercase letters, numbers, or hyphens'), { status: 400 });
  }
  if (name.length < 2 || name.length > 32) {
    throw Object.assign(new Error('Profile name must be 2-32 characters'), { status: 400 });
  }
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(handle)) {
    throw Object.assign(new Error('Profile handle must be 2-40 lowercase letters, numbers, or hyphens'), { status: 400 });
  }

  const engine = body?.engine && typeof body.engine === 'object' ? body.engine : {};
  const skillLevel = Number(engine.skillLevel);
  const threads = Number(engine.threads ?? 1);
  const hashMb = Number(engine.hashMb ?? 64);
  const moveTimeMs = Number(engine.moveTimeMs ?? 1200);
  const multiPv = Number(engine.multiPv ?? 1);

  if (!Number.isInteger(skillLevel) || skillLevel < 0 || skillLevel > 20) {
    throw Object.assign(new Error('Stockfish skill level must be an integer from 0 to 20'), { status: 400 });
  }
  if (!Number.isInteger(threads) || threads < 1 || threads > 8) {
    throw Object.assign(new Error('Engine threads must be an integer from 1 to 8'), { status: 400 });
  }
  if (!Number.isInteger(hashMb) || hashMb < 16 || hashMb > 1024) {
    throw Object.assign(new Error('Engine hash must be an integer from 16 to 1024 MB'), { status: 400 });
  }
  if (!Number.isInteger(moveTimeMs) || moveTimeMs < 100 || moveTimeMs > 10_000) {
    throw Object.assign(new Error('Move time must be an integer from 100 to 10000 ms'), { status: 400 });
  }
  if (!Number.isInteger(multiPv) || multiPv < 1 || multiPv > 5) {
    throw Object.assign(new Error('MultiPV must be an integer from 1 to 5'), { status: 400 });
  }

  const opening = body?.opening && typeof body.opening === 'object' ? body.opening : {};
  const openingName = typeof opening.name === 'string' && opening.name.trim()
    ? opening.name.trim().slice(0, 60)
    : 'Stockfish';

  return {
    id,
    name,
    handle,
    color: body?.color === 'Black' ? 'Black' : 'White',
    engine: {
      name: typeof engine.name === 'string' && engine.name.trim() ? engine.name.trim().slice(0, 40) : 'Stockfish',
      threads,
      hashMb,
      skillLevel,
      moveTimeMs,
      multiPv,
    },
    opening: {
      name: openingName,
      moves: normalizeMoves(opening.moves),
    },
    active: body?.active !== false,
  };
}

async function listProfiles(pool) {
  const { rows } = await pool.query(
    'SELECT id, name, handle, color, engine, opening, active FROM agent_profiles ORDER BY created_at ASC, name ASC',
  );
  return rows.map(profileFromRow);
}

/**
 * Active roster for matchmaking. Falls back to the bundled seed file when the
 * table is empty (fresh checkout, tests, or a database that has not migrated).
 */
async function loadRosterFromPool(pool, file = DEFAULT_ROSTER_PATH) {
  if (pool) {
    try {
      const { rows } = await pool.query(
        'SELECT id, name, handle, color, engine, opening, active FROM agent_profiles WHERE active = TRUE ORDER BY created_at ASC, name ASC',
      );
      if (rows.length >= 2) return rows.map(profileFromRow);
    } catch {
      // Fall through to the seed file so a missing table cannot stop the arena.
    }
  }
  return readSeedRoster(file);
}

async function createProfile(pool, body) {
  const profile = parseProfile(body);
  const { rows } = await pool.query(
    `INSERT INTO agent_profiles (id, name, handle, color, engine, opening, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, name, handle, color, engine, opening, active`,
    [profile.id, profile.name, profile.handle, profile.color, profile.engine, profile.opening, profile.active],
  );
  if (!rows[0]) {
    throw Object.assign(new Error(`A profile with id ${profile.id} already exists`), { status: 409 });
  }
  return profileFromRow(rows[0]);
}

async function updateProfile(pool, id, body) {
  const profile = parseProfile({ ...body, id });
  const { rows } = await pool.query(
    `UPDATE agent_profiles
        SET name=$2, handle=$3, color=$4, engine=$5, opening=$6, active=$7, updated_at=NOW()
      WHERE id=$1
      RETURNING id, name, handle, color, engine, opening, active`,
    [profile.id, profile.name, profile.handle, profile.color, profile.engine, profile.opening, profile.active],
  );
  if (!rows[0]) throw Object.assign(new Error('Profile not found'), { status: 404 });
  return profileFromRow(rows[0]);
}

async function deleteProfile(pool, id) {
  const { rowCount } = await pool.query('DELETE FROM agent_profiles WHERE id = $1', [id]);
  if (rowCount !== 1) throw Object.assign(new Error('Profile not found'), { status: 404 });
  return { id, deleted: true };
}

async function seedProfiles(pool, file = DEFAULT_ROSTER_PATH) {
  const roster = readSeedRoster(file);
  let inserted = 0;
  for (const profile of roster) {
    const normalized = parseProfile(profile);
    const result = await pool.query(
      `INSERT INTO agent_profiles (id, name, handle, color, engine, opening, active)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [normalized.id, normalized.name, normalized.handle, normalized.color, normalized.engine, normalized.opening],
    );
    inserted += result.rowCount;
  }
  return inserted;
}

module.exports = {
  DEFAULT_ROSTER_PATH,
  parseProfile,
  listProfiles,
  loadRosterFromPool,
  createProfile,
  updateProfile,
  deleteProfile,
  seedProfiles,
};
