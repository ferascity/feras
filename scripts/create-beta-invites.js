#!/usr/bin/env node
'use strict';

/*
 * Create, list, and revoke private beta invite codes.
 *
 * Usage:
 *   node scripts/create-beta-invites.js --count 10
 *   node scripts/create-beta-invites.js --code FERAS-BETA-FOUNDER --max-claims 3
 *   node scripts/create-beta-invites.js --list
 *   node scripts/create-beta-invites.js --revoke FERAS-BETA-7K2M
 *
 * Requires FERAS_DATABASE_URL (or --database-url). Codes are printed as
 * ready-to-share links using FERAS_BETA_WEB_ORIGIN when it is set.
 */

const crypto = require('node:crypto');
const { Client } = require('pg');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function usage() {
  process.stdout.write(`Usage: node scripts/create-beta-invites.js [options]

  --count <n>          Number of codes to create (default 1)
  --code <code>        Explicit code instead of a random one
  --max-claims <n>     Claims allowed per code (default 1)
  --sol <amount>       Starter SOL per claim (default 0.25)
  --usdc <amount>      Starter test-USDC per claim (default 25)
  --label <text>       Human-readable note (cohort name, person, etc.)
  --expires <iso>      Expiry timestamp, for example 2026-12-01T00:00:00Z
  --list               Print existing codes
  --revoke <code>      Revoke a code (existing claims are unaffected)
  --database-url <dsn> Override FERAS_DATABASE_URL
`);
}

function parseArgs(argv) {
  const args = { count: 1, maxClaims: 1, sol: 0.25, usdc: 25 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      index += 1;
      return value;
    };
    switch (flag) {
      case '--count': args.count = Number(next()); break;
      case '--code': args.code = next(); break;
      case '--max-claims': args.maxClaims = Number(next()); break;
      case '--sol': args.sol = Number(next()); break;
      case '--usdc': args.usdc = Number(next()); break;
      case '--label': args.label = next(); break;
      case '--expires': args.expires = next(); break;
      case '--database-url': args.databaseUrl = next(); break;
      case '--list': args.list = true; break;
      case '--revoke': args.revoke = next(); break;
      case '--help': case '-h': args.help = true; break;
      default: throw new Error(`Unknown option: ${flag}`);
    }
  }
  return args;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const databaseUrl = args.databaseUrl || process.env.FERAS_DATABASE_URL;
  if (!databaseUrl) throw new Error('FERAS_DATABASE_URL is required (or pass --database-url)');

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    if (args.list) {
      const { rows } = await client.query(
        `SELECT code, label, max_claims, claim_count, starter_sol, starter_usdc, revoked, expires_at, created_at
           FROM beta_invites ORDER BY created_at DESC`,
      );
      for (const row of rows) {
        const status = row.revoked ? 'REVOKED' : row.expires_at && new Date(row.expires_at) <= new Date() ? 'EXPIRED' : 'ACTIVE';
        process.stdout.write(
          `${row.code}\t${status}\t${row.claim_count}/${row.max_claims}\t${row.starter_sol} SOL + ${row.starter_usdc} USDC\t${row.label ?? ''}\n`,
        );
      }
      return;
    }

    if (args.revoke) {
      const { rowCount } = await client.query('UPDATE beta_invites SET revoked = TRUE WHERE code = $1', [args.revoke.trim().toUpperCase()]);
      process.stdout.write(rowCount ? `Revoked ${args.revoke}\n` : `No invite matched ${args.revoke}\n`);
      return;
    }

    if (!Number.isInteger(args.count) || args.count < 1 || args.count > 500) throw new Error('--count must be between 1 and 500');
    if (!Number.isInteger(args.maxClaims) || args.maxClaims < 1) throw new Error('--max-claims must be at least 1');
    if (!(args.sol >= 0) || !(args.usdc >= 0)) throw new Error('Starter amounts cannot be negative');

    const origin = process.env.FERAS_BETA_WEB_ORIGIN;
    for (let index = 0; index < args.count; index += 1) {
      const code = (args.code ?? randomCode()).trim().toUpperCase();
      const { rows } = await client.query(
        `INSERT INTO beta_invites (code, label, max_claims, starter_sol, starter_usdc, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (code) DO NOTHING
         RETURNING code`,
        [code, args.label ?? null, args.maxClaims, args.sol, args.usdc, args.expires ?? null],
      );
      if (!rows.length) {
        process.stderr.write(`Skipped existing code ${code}\n`);
        continue;
      }
      process.stdout.write(`${code}\t${inviteUrl(origin, code)}\n`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
