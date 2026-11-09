const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROSTER_PATH = path.resolve(__dirname, '..', '..', 'config', 'agent-profiles.json');

function loadRoster(file = DEFAULT_ROSTER_PATH) {
  const roster = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(roster) || roster.length < 2) {
    throw new Error('agent-profiles.json must contain at least two engine profiles');
  }
  return roster;
}

/**
 * Circle-method round robin. Every profile plays every other profile once
 * before the schedule repeats, and each persona appears once per round.
 * Returns a flat list of `{ round, white, black }` entries where `white` and
 * `black` are profile IDs. Colors are flipped every full schedule cycle so a
 * persona does not stay on the same side forever.
 */
function roundRobinSchedule(roster) {
  const ids = roster.map((profile) => profile.id);
  if (ids.length % 2 === 1) ids.push(null); // bye slot
  const slots = ids.length;
  const rounds = [];
  let ring = ids.slice();

  for (let round = 0; round < slots - 1; round += 1) {
    const pairs = [];
    for (let index = 0; index < slots / 2; index += 1) {
      const first = ring[index];
      const second = ring[slots - 1 - index];
      if (first && second) pairs.push({ round, first, second });
    }
    rounds.push(pairs);
    ring = [ring[0], ring[slots - 1], ...ring.slice(1, slots - 1)];
  }

  const schedule = [];
  for (const pairs of rounds) {
    for (const pair of pairs) {
      const swap = pair.round % 2 === 1;
      schedule.push({
        round: pair.round,
        white: swap ? pair.second : pair.first,
        black: swap ? pair.first : pair.second,
      });
    }
  }
  return schedule;
}

function rosterIndex(roster) {
  return new Map(roster.map((profile) => [profile.id, profile]));
}

/**
 * Deterministic pairing for a sequence number (usually the numeric part of the
 * next `gp-NNN` id). Cycles through the full round-robin schedule and flips
 * colors on every repeat, so repeated background pairings stay varied and fair.
 */
function pairingForIndex(roster, index = 0, { swapColors = false } = {}) {
  const schedule = roundRobinSchedule(roster);
  if (schedule.length === 0) throw new Error('No pairings available for this roster');
  const safeIndex = Math.max(0, Math.trunc(index));
  const cycle = Math.floor(safeIndex / schedule.length);
  const entry = schedule[safeIndex % schedule.length];
  const flipped = (cycle % 2 === 1) !== swapColors;
  const byId = rosterIndex(roster);
  const whiteId = flipped ? entry.black : entry.white;
  const blackId = flipped ? entry.white : entry.black;
  return {
    white: byId.get(whiteId),
    black: byId.get(blackId),
    scheduleIndex: safeIndex % schedule.length,
    cycle,
    swapColors: flipped,
  };
}

function nextGrandPrixNumber(matches = []) {
  let next = 1;
  for (const match of matches) {
    const found = typeof match?.id === 'string' && match.id.match(/^gp-(\d+)$/i);
    if (!found) continue;
    const value = Number.parseInt(found[1], 10);
    if (value >= next) next = value + 1;
  }
  return next;
}

module.exports = {
  DEFAULT_ROSTER_PATH,
  loadRoster,
  nextGrandPrixNumber,
  pairingForIndex,
  roundRobinSchedule,
};
