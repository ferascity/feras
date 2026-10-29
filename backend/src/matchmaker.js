#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { MatchRepository } = require('./repository');
const { INITIAL_FEN } = require('./match-runner');
const { nextTranscriptHash, GENESIS_HASH } = require('./canonical');

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function loadProfiles() {
  const file = path.resolve(__dirname, '..', '..', 'config', 'agent-profiles.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function autoPairMatch({
  databaseUrl = process.env.FERAS_DATABASE_URL,
  matchId = null,
  title = null,
  category = 'BENCHMARK',
  countdownMinutes = 15,
  whiteAgentId = null,
  blackAgentId = null,
  baseTimeMs = 180_000,
  incrementMs = 2_000,
} = {}) {
  if (!databaseUrl) throw new Error('FERAS_DATABASE_URL is required');
  const repository = new MatchRepository(databaseUrl);
  try {
    const existing = await repository.listMatches();
    const profiles = loadProfiles();

    // Auto-calculate next round number
    let nextNum = 1;
    for (const m of existing) {
      const match = m.id.match(/^gp-(\d+)$/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n >= nextNum) nextNum = n + 1;
      }
    }
    const finalId = matchId || `gp-${String(nextNum).padStart(3, '0')}`;
    const finalTitle = title || `Grand Prix Round ${nextNum}`;

    // Select White & Black profiles (alternating if even round)
    let white = profiles.find((p) => p.id === whiteAgentId) || profiles[0];
    let black = profiles.find((p) => p.id === blackAgentId) || profiles[1];

    if (!whiteAgentId && !blackAgentId && nextNum % 2 === 0) {
      // Swap colors for fairness on even rounds
      const temp = white;
      white = { ...black, color: 'White' };
      black = { ...temp, color: 'Black' };
    }

    const lockTime = new Date(Date.now() + Math.max(countdownMinutes, 5) * 60_000);
    const createdEvent = { type: 'MATCH_CREATED', matchId: finalId, initialFen: INITIAL_FEN };

    await repository.createMatch({
      id: finalId,
      title: finalTitle,
      category,
      whiteProfile: white,
      blackProfile: black,
      engineSettings: {
        protocol: 'UCI',
        stockfishPath: process.env.FERAS_STOCKFISH_PATH || '/usr/games/stockfish',
      },
      initialFen: INITIAL_FEN,
      baseTimeMs,
      incrementMs,
      marketLockTime: lockTime,
      initialHash: nextTranscriptHash(GENESIS_HASH, createdEvent),
    });

    return {
      id: finalId,
      title: finalTitle,
      category,
      whiteAgent: white.name,
      blackAgent: black.name,
      lockTime: Math.floor(lockTime.getTime() / 1000),
      marketLockTime: lockTime.toISOString(),
      timeControl: `${Math.floor(baseTimeMs / 60000)}+${Math.floor(incrementMs / 1000)}`,
    };
  } finally {
    await repository.close();
  }
}

async function main() {
  const countdownMinutes = Number(option('countdown-mins') || option('lock-mins') || 15);
  const result = await autoPairMatch({
    matchId: option('id'),
    title: option('title'),
    category: option('category') || 'BENCHMARK',
    countdownMinutes,
    whiteAgentId: option('white'),
    blackAgentId: option('black'),
    baseTimeMs: Number(option('base-ms') || 180_000),
    incrementMs: Number(option('increment-ms') || 2_000),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { autoPairMatch };
