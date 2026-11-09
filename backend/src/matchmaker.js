#!/usr/bin/env node
const { MatchRepository } = require('./repository');
const { INITIAL_FEN } = require('./match-runner');
const { nextTranscriptHash, GENESIS_HASH } = require('./canonical');
const { loadRoster, nextGrandPrixNumber, pairingForIndex } = require('./pairing');

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function autoPairMatch({
  databaseUrl = process.env.FERAS_DATABASE_URL,
  matchId = null,
  title = null,
  category = 'BENCHMARK',
  countdownMinutes = 15,
  whiteAgentId = null,
  blackAgentId = null,
  swapColors = false,
  baseTimeMs = 180_000,
  incrementMs = 2_000,
} = {}) {
  if (!databaseUrl) throw new Error('FERAS_DATABASE_URL is required');
  const repository = new MatchRepository(databaseUrl);
  try {
    const existing = await repository.listMatches();
    const roster = loadRoster();
    const nextNum = nextGrandPrixNumber(existing);
    const finalId = matchId || `gp-${String(nextNum).padStart(3, '0')}`;
    const finalTitle = title || `Grand Prix Round ${nextNum}`;

    // The rotation index follows the match number so the schedule keeps moving
    // forward even when older rounds are purged or abandoned.
    const rotation = pairingForIndex(roster, nextNum - 1, { swapColors });
    let white = whiteAgentId ? roster.find((profile) => profile.id === whiteAgentId) : rotation.white;
    let black = blackAgentId ? roster.find((profile) => profile.id === blackAgentId) : rotation.black;
    if (!white || !black) throw new Error('Requested pairing references an unknown agent profile');
    if (white.id === black.id) throw new Error('A match needs two different agent profiles');

    white = { ...white, color: 'White' };
    black = { ...black, color: 'Black' };

    const lockTime = new Date(Date.now() + Math.max(countdownMinutes, 1) * 60_000);
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
      whiteAgentId: white.id,
      blackAgentId: black.id,
      scheduleIndex: rotation.scheduleIndex,
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
    swapColors: process.argv.includes('--swap-colors'),
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
