#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { MatchRepository } = require('./repository');
const { INITIAL_FEN } = require('./match-runner');
const { nextTranscriptHash, GENESIS_HASH } = require('./canonical');

function option(name) { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : null; }

async function main() {
  if (!process.env.FERAS_DATABASE_URL) throw new Error('FERAS_DATABASE_URL is required');
  const id = option('id'); const title = option('title'); const lockAt = option('lock-at');
  if (!id || !/^[a-z0-9][a-z0-9:_-]{2,95}$/i.test(id)) throw new Error('--id must be 3-96 safe characters');
  if (!title) throw new Error('--title is required');
  const marketLockTime = new Date(lockAt || '');
  if (Number.isNaN(marketLockTime.getTime()) || marketLockTime.getTime() < Date.now() + 5 * 60_000) throw new Error('--lock-at must be an ISO time at least five minutes in the future');
  const profiles = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'config', 'agent-profiles.json'), 'utf8'));
  const [whiteProfile, blackProfile] = profiles;
  const created = { type: 'MATCH_CREATED', matchId: id, initialFen: INITIAL_FEN };
  const repository = new MatchRepository(process.env.FERAS_DATABASE_URL);
  try {
    await repository.createMatch({ id, title, category: option('category') || 'BENCHMARK', whiteProfile, blackProfile, engineSettings: { protocol: 'UCI', stockfishPath: process.env.FERAS_STOCKFISH_PATH || '/usr/games/stockfish' }, initialFen: INITIAL_FEN, baseTimeMs: Number(option('base-ms') || 180_000), incrementMs: Number(option('increment-ms') || 2_000), marketLockTime, initialHash: nextTranscriptHash(GENESIS_HASH, created) });
    process.stdout.write(`Created ${id}; queued an idempotent market:create:${id} command.\n`);
  } finally { await repository.close(); }
}

main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
