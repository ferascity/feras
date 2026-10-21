const { verifyTranscript } = require('./canonical');

function agent(profile, color, matchId) {
  return {
    id: profile.id, name: profile.name, handle: profile.handle, badgeEmoji: color === 'White' ? 'W' : 'B', tier: 'ENGINE', status: 'IN_MATCH',
    stats: { elo: 0, peakElo: 0, totalMatches: 0, wins: 0, losses: 0, draws: 0, winRate: 0, avgMoveTimeSec: 0, aggressionScore: 0, accuracyPercent: 0, favoredOpening: profile.opening?.name || 'Stockfish', eloHistory: [] },
    architecture: { baseModel: profile.engine?.name || 'Stockfish', parameters: `Skill ${profile.engine?.skillLevel ?? 'unknown'}`, contextWindow: 'N/A', searchAlgorithm: 'UCI', evalDepth: 0, author: 'Feras' },
    currentMatchId: matchId, earningsSol: 0, totalVolumeUsdc: 0,
  };
}

function outcome(result) { return result === '1-0' ? 'WHITE' : result === '0-1' ? 'BLACK' : 'DRAW'; }

function serializeMatch(match, moves = []) {
  const status = match.status === 'SCHEDULED' ? 'UPCOMING' : match.status === 'COMPLETED' ? 'COMPLETED' : 'LIVE';
  return {
    id: match.id, title: match.title, category: match.category, status,
    whiteAgent: agent(match.white_profile, 'White', match.id), blackAgent: agent(match.black_profile, 'Black', match.id),
    currentPly: match.current_ply, totalPlies: match.status === 'COMPLETED' ? match.current_ply : undefined,
    timeControl: `${Math.floor(Number(match.white_clock_ms) / 60000)}+${Math.floor(Number(match.increment_ms) / 1000)}`,
    viewerCount: 0, poolVolumeUsdc: 0,
    marketEstimates: { whiteMultiplier: 0, drawMultiplier: 0, blackMultiplier: 0 },
    currentFen: match.current_fen, startedAt: match.started_at, evalScore: Number(match.current_eval_centipawns || 0) / 100,
    engineAnalysis: match.current_analysis || [],
    marketAddress: match.market_address, vaultAddress: match.vault_address,
    transcriptHash: match.transcript_hash,
    replay: {
      matchId: match.id, initialFen: match.initial_fen,
      moves: moves.map((move) => ({ ply: move.ply, from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), piece: move.piece, color: move.color === 'WHITE' ? 'w' : 'b', san: move.san, fen: move.fen, evalCentipawns: move.eval_centipawns, analysis: move.analysis || [], timeSpentSec: Number(move.time_spent_ms) / 1000, captured: move.captured, promotion: move.promotion, isCheck: move.is_check, isCheckmate: move.is_checkmate, winProbabilityWhite: 0.5 })),
      result: match.result, terminationReason: match.termination_reason || 'In progress', pgn: match.pgn,
    },
    result: match.result === '*' ? null : outcome(match.result),
  };
}

function createReadApi(repository) {
  return {
    async list(status) { return Promise.all((await repository.listMatches(status === 'LIVE' ? 'LIVE' : status === 'UPCOMING' ? 'SCHEDULED' : status === 'COMPLETED' ? 'COMPLETED' : undefined)).map(async (match) => serializeMatch(match, await repository.getMoves(match.id)))); },
    async get(id) { const match = await repository.getMatch(id); return match ? serializeMatch(match, await repository.getMoves(id)) : null; },
    async replay(id) { const match = await repository.getMatch(id); return match ? serializeMatch(match, await repository.getMoves(id)).replay : null; },
    async events(id, after) { return repository.getEvents(id, after); },
    async transcript(id) {
      const match = await repository.getMatch(id);
      if (!match) return null;
      const events = await repository.getEvents(id);
      return { matchId: id, storedTranscriptHash: match.transcript_hash, ...verifyTranscript(events, match.transcript_hash), events };
    },
    async ready() { await repository.ping(); return { status: 'ok', matchSource: 'postgres' }; },
  };
}

module.exports = { createReadApi, serializeMatch };
