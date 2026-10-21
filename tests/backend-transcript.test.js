const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalJson, nextTranscriptHash, verifyTranscript, GENESIS_HASH } = require('../backend/src/canonical');
const { MatchRunner, INITIAL_FEN, openingMove } = require('../backend/src/match-runner');
const { parseInfo } = require('../backend/src/uci-engine');

test('canonical transcript encoding is stable regardless of object insertion order', () => {
  const first = { type: 'MOVE', ply: 1, clocks: { black: 60, white: 59 } };
  const second = { clocks: { white: 59, black: 60 }, ply: 1, type: 'MOVE' };
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.equal(nextTranscriptHash(GENESIS_HASH, first), nextTranscriptHash(GENESIS_HASH, second));
});

test('transcript verification detects a modified event payload', () => {
  const first = { type: 'MATCH_CREATED', matchId: 'proof' };
  const firstHash = nextTranscriptHash(GENESIS_HASH, first);
  const second = { type: 'MOVE', matchId: 'proof', uci: 'e2e4' };
  const secondHash = nextTranscriptHash(firstHash, second);
  const events = [
    { sequence: 1, previous_hash: GENESIS_HASH, event_hash: firstHash, payload: first },
    { sequence: 2, previous_hash: firstHash, event_hash: secondHash, payload: second },
  ];
  assert.equal(verifyTranscript(events, secondHash).valid, true);
  events[1].payload.uci = 'd2d4';
  assert.equal(verifyTranscript(events, secondHash).valid, false);
});

test('Stockfish UCI info parser preserves score and principal variation', () => {
  assert.deepEqual(parseInfo('info depth 18 seldepth 26 multipv 2 score cp -34 nodes 1234 pv e7e5 g1f3 b8c6'), {
    depth: 18, multiPv: 2, scoreCp: -34, scoreMate: null, principalVariation: ['e7e5', 'g1f3', 'b8c6'],
  });
});

test('opening profile only supplies a legal move for the active side', () => {
  const { Chess } = require('chess.js');
  assert.equal(openingMove({ opening: { moves: ['e2e4'] } }, 0, new Chess(INITIAL_FEN)), 'e2e4');
  assert.equal(openingMove({ opening: { moves: ['e7e5'] } }, 0, new Chess(INITIAL_FEN)), null);
});

test('runner stores an authoritative legal move, FEN, clock values, and transcript hash', async () => {
  let recorded;
  const repository = {
    async recordMove(input) { recorded = input; return input; },
  };
  const runner = new MatchRunner({
    repository,
    engineFactory: () => ({ async bestMoveWithAnalysis() { return { uci: 'e2e4', analysis: [{ depth: 10, multiPv: 1, scoreCp: 22, scoreMate: null, principalVariation: ['e2e4', 'e7e5'] }] }; }, async stop() {} }),
    now: (() => { const values = [1_000, 1_225]; return () => values.shift() ?? 1_225; })(),
  });
  const createdHash = nextTranscriptHash(GENESIS_HASH, { type: 'MATCH_CREATED', matchId: 'test-match', initialFen: INITIAL_FEN });
  const match = {
    id: 'test-match', current_ply: 0, current_fen: INITIAL_FEN, initial_fen: INITIAL_FEN,
    white_clock_ms: 60_000, black_clock_ms: 60_000, increment_ms: 2_000, transcript_hash: createdHash,
    white_profile: { engine: { moveTimeMs: 1_000 } }, black_profile: { engine: { moveTimeMs: 1_000 } },
  };
  await runner.runOnePly(match);
  assert.equal(recorded.move.san, 'e4');
  assert.equal(recorded.move.ply, 1);
  assert.equal(recorded.move.whiteClockMs, 61_775);
  assert.match(recorded.move.fen, /^rnbqkbnr\/pppppppp\/8\/8\/4P3/);
  assert.equal(recorded.move.evalCentipawns, 22);
  assert.equal(recorded.eventHash, nextTranscriptHash(createdHash, recorded.event));
});
