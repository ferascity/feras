const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nextGrandPrixNumber,
  pairingForIndex,
  roundRobinSchedule,
} = require('../backend/src/pairing');

const ROSTER = [
  { id: 'atlas-stockfish-16', name: 'Atlas' },
  { id: 'bishop-stockfish-14', name: 'Bishop' },
  { id: 'nova-stockfish-16', name: 'Nova' },
  { id: 'rook-stockfish-12', name: 'Rook' },
  { id: 'vega-stockfish-20', name: 'Vega' },
  { id: 'titan-stockfish-10', name: 'Titan' },
];

test('round-robin schedule covers every unique pairing exactly once', () => {
  const schedule = roundRobinSchedule(ROSTER);
  assert.equal(schedule.length, (ROSTER.length * (ROSTER.length - 1)) / 2);
  const seen = new Set();
  for (const entry of schedule) {
    assert.notEqual(entry.white, entry.black);
    const key = [entry.white, entry.black].sort().join('|');
    assert.equal(seen.has(key), false, `duplicate pairing ${key}`);
    seen.add(key);
  }
});

test('each persona appears once per round', () => {
  const schedule = roundRobinSchedule(ROSTER);
  const rounds = new Map();
  for (const entry of schedule) {
    const list = rounds.get(entry.round) || [];
    list.push(entry.white, entry.black);
    rounds.set(entry.round, list);
  }
  for (const [, players] of rounds) {
    assert.equal(new Set(players).size, players.length);
  }
});

test('pairingForIndex rotates deterministically and flips colors each cycle', () => {
  const schedule = roundRobinSchedule(ROSTER);
  const first = pairingForIndex(ROSTER, 0);
  const repeat = pairingForIndex(ROSTER, schedule.length);
  assert.equal(first.white.id, repeat.black.id);
  assert.equal(first.black.id, repeat.white.id);
  assert.equal(first.cycle, 0);
  assert.equal(repeat.cycle, 1);
  assert.equal(repeat.swapColors, true);

  const explicitSwap = pairingForIndex(ROSTER, 0, { swapColors: true });
  assert.equal(explicitSwap.white.id, first.black.id);
  assert.equal(explicitSwap.black.id, first.white.id);
});

test('pairingForIndex clamps negative indexes to the start of the schedule', () => {
  const first = pairingForIndex(ROSTER, 0);
  const clamped = pairingForIndex(ROSTER, -12);
  assert.equal(clamped.white.id, first.white.id);
  assert.equal(clamped.black.id, first.black.id);
});

test('nextGrandPrixNumber ignores non-grand-prix ids and advances past gaps', () => {
  assert.equal(nextGrandPrixNumber([]), 1);
  assert.equal(nextGrandPrixNumber([{ id: 'gp-001' }, { id: 'gp-003' }]), 4);
  assert.equal(nextGrandPrixNumber([{ id: 'solana-grand-prix-final-001' }]), 1);
  assert.equal(nextGrandPrixNumber([{ id: 'gp-010' }, { id: 'gp-002' }]), 11);
});
