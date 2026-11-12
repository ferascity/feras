'use strict';

/*
 * Invite and tester administration for the private beta.
 *
 * The CLI script remains the canonical way to mint codes, but the admin console
 * needs the same operations over HTTP. These helpers contain no secrets; they
 * only read and write the beta tables.
 */

const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^FERAS-BETA-[A-Z0-9]{4,16}$/;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function randomCode() {
  let suffix = '';
  const bytes = crypto.randomBytes(8);
  for (let index = 0; index < 8; index += 1) suffix += ALPHABET[bytes[index] % ALPHABET.length];
  return `FERAS-BETA-${suffix}`;
}

function inviteUrl(origin, code) {
  const base = (origin || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/profile?invite=${encodeURIComponent(code)}`;
}

async function listInvites(pool) {
  const { rows } = await pool.query(
    `SELECT code, label, max_claims, claim_count, starter_sol, starter_usdc, revoked, expires_at, created_at
       FROM beta_invites ORDER BY created_at DESC`,
  );
  return rows.map((row) => ({
    code: row.code,
    label: row.label,
    maxClaims: Number(row.max_claims),
    claimCount: Number(row.claim_count),
    starterSol: Number(row.starter_sol),
    starterUsdc: Number(row.starter_usdc),
    revoked: row.revoked,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    status: row.revoked
      ? 'REVOKED'
      : row.expires_at && new Date(row.expires_at).getTime() <= Date.now()
        ? 'EXPIRED'
        : Number(row.claim_count) >= Number(row.max_claims)
          ? 'USED'
          : 'ACTIVE',
  }));
}

function parseInviteOptions(body = {}) {
  const count = body.count === undefined ? 1 : Number(body.count);
  const maxClaims = body.maxClaims === undefined ? 1 : Number(body.maxClaims);
  const sol = body.sol === undefined ? 0.25 : Number(body.sol);
  const usdc = body.usdc === undefined ? 25 : Number(body.usdc);
  const explicit = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : null;
  const expires = typeof body.expires === 'string' && body.expires.trim() ? body.expires.trim() : null;

  if (!Number.isInteger(count) || count < 1 || count > 100) throw httpError(400, 'count must be an integer from 1 to 100');
  if (!Number.isInteger(maxClaims) || maxClaims < 1 || maxClaims > 10_000) throw httpError(400, 'maxClaims must be an integer from 1 to 10000');
  if (!(sol >= 0) || sol > 10) throw httpError(400, 'Starter SOL must be between 0 and 10');
  if (!(usdc >= 0) || usdc > 10_000) throw httpError(400, 'Starter USDC must be between 0 and 10000');
  if (explicit && !CODE_PATTERN.test(explicit)) throw httpError(400, 'Invite codes must look like FERAS-BETA-XXXXXXXX');
  if (expires && Number.isNaN(new Date(expires).getTime())) throw httpError(400, 'expires must be a valid ISO timestamp');
  if (explicit && count > 1) throw httpError(400, 'An explicit code can only be created once');

  return { count, maxClaims, sol, usdc, explicit, label, expires };
}

async function createInvites(pool, body = {}, { origin } = {}) {
  const options = parseInviteOptions(body);
  const created = [];
  for (let index = 0; index < options.count; index += 1) {
    const code = options.explicit || randomCode();
    const { rows } = await pool.query(
      `INSERT INTO beta_invites (code, label, max_claims, starter_sol, starter_usdc, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO NOTHING
       RETURNING code, label, max_claims, claim_count, starter_sol, starter_usdc, revoked, expires_at, created_at`,
      [code, options.label, options.maxClaims, options.sol, options.usdc, options.expires],
    );
    if (!rows[0]) throw httpError(409, `Invite ${code} already exists`);
    created.push({
      code: rows[0].code,
      label: rows[0].label,
      maxClaims: Number(rows[0].max_claims),
      starterSol: Number(rows[0].starter_sol),
      starterUsdc: Number(rows[0].starter_usdc),
      expiresAt: rows[0].expires_at ? new Date(rows[0].expires_at).toISOString() : null,
      createdAt: new Date(rows[0].created_at).toISOString(),
      url: inviteUrl(origin, rows[0].code),
    });
  }
  return created;
}

async function revokeInvite(pool, codeValue) {
  const code = String(codeValue || '').trim().toUpperCase();
  if (!code) throw httpError(400, 'An invite code is required');
  const { rowCount } = await pool.query('UPDATE beta_invites SET revoked = TRUE WHERE code = $1', [code]);
  if (rowCount !== 1) throw httpError(404, 'Invite not found');
  return { code, revoked: true };
}

async function listTesters(pool) {
  const { rows } = await pool.query(
    `SELECT t.wallet, t.invite_code, t.claimed_at, t.blocked, t.created_at, t.last_seen_at,
            i.label AS invite_label
       FROM beta_testers t
       LEFT JOIN beta_invites i ON i.code = t.invite_code
       ORDER BY t.created_at DESC
       LIMIT 500`,
  );
  return rows.map((row) => ({
    wallet: row.wallet,
    inviteCode: row.invite_code,
    inviteLabel: row.invite_label,
    claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
    blocked: row.blocked,
    createdAt: new Date(row.created_at).toISOString(),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
  }));
}

async function setTesterBlocked(pool, walletValue, blocked) {
  const wallet = String(walletValue || '').trim();
  if (!wallet) throw httpError(400, 'A wallet address is required');
  const { rowCount } = await pool.query(
    'UPDATE beta_testers SET blocked = $2, last_seen_at = NOW() WHERE wallet = $1',
    [wallet, blocked === true],
  );
  if (rowCount !== 1) throw httpError(404, 'Tester not found');
  return { wallet, blocked: blocked === true };
}

module.exports = {
  inviteUrl,
  listInvites,
  createInvites,
  revokeInvite,
  listTesters,
  setTesterBlocked,
};
