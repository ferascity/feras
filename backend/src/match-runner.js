const { Chess } = require('chess.js');
const { nextTranscriptHash } = require('./canonical');

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function uciToMove(uci) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error(`Engine returned invalid UCI move: ${uci}`);
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

function resultForGame(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? { result: '0-1', reason: 'Checkmate' } : { result: '1-0', reason: 'Checkmate' };
  if (chess.isDraw()) return { result: '1/2-1/2', reason: chess.isStalemate() ? 'Stalemate' : 'Draw by rule' };
  return { result: '*', reason: null };
}

function openingMove(profile, currentPly, chess) {
  const move = profile.opening?.moves?.[Math.floor(currentPly / 2)];
  if (!move) return null;
  try {
    const candidate = chess.move(uciToMove(move));
    chess.undo();
    return candidate ? move : null;
  } catch {
    return null;
  }
}

class MatchRunner {
  constructor({ repository, engineFactory, now = () => Date.now() }) {
    this.repository = repository;
    this.engineFactory = engineFactory;
    this.now = now;
  }

  async runOnePly(match) {
    const chess = new Chess(match.current_fen || match.initial_fen || INITIAL_FEN);
    if (chess.isGameOver()) return this.complete(match, chess);

    const isWhite = chess.turn() === 'w';
    const profile = isWhite ? match.white_profile : match.black_profile;
    const remaining = Number(isWhite ? match.white_clock_ms : match.black_clock_ms);
    if (remaining <= 0) return this.timeout(match, isWhite);

    const started = this.now();
    const engine = this.engineFactory(profile.engine);
    let uci;
    let analysis = [];
    const bookMove = openingMove(profile, Number(match.current_ply), chess);
    try {
      if (bookMove) {
        uci = bookMove;
      } else if (engine.bestMoveWithAnalysis) {
        const search = await engine.bestMoveWithAnalysis({
          fen: chess.fen(),
          moveTimeMs: Math.min(profile.engine.moveTimeMs, remaining),
          multiPv: profile.engine.multiPv || 1,
        });
        uci = search.uci;
        analysis = search.analysis;
      } else {
        uci = await engine.bestMove({ fen: chess.fen(), moveTimeMs: Math.min(profile.engine.moveTimeMs, remaining) });
      }
    } finally {
      await engine.stop?.();
    }
    const elapsed = Math.max(0, this.now() - started);
    const adjusted = Math.max(0, remaining - elapsed);
    if (adjusted === 0) return this.timeout(match, isWhite);

    const move = chess.move(uciToMove(uci));
    if (!move) throw new Error(`Stockfish produced an illegal move for ${match.id}: ${uci}`);
    const whiteClock = isWhite ? adjusted + Number(match.increment_ms) : Number(match.white_clock_ms);
    const blackClock = isWhite ? Number(match.black_clock_ms) : adjusted + Number(match.increment_ms);
    const gameResult = resultForGame(chess);
    const event = {
      type: 'MOVE',
      matchId: match.id,
      ply: Number(match.current_ply) + 1,
      uci,
      san: move.san,
      fen: chess.fen(),
      whiteClockMs: whiteClock,
      blackClockMs: blackClock,
      timeSpentMs: elapsed,
      source: bookMove ? 'OPENING_BOOK' : 'STOCKFISH',
      analysis,
    };

    return this.repository.recordMove({
      matchId: match.id,
      expectedPly: Number(match.current_ply),
      move: {
        ply: event.ply,
        uci,
        san: move.san,
        fen: chess.fen(),
        pgn: chess.pgn({ maxWidth: 0, newline: '\n' }),
        color: isWhite ? 'WHITE' : 'BLACK',
        piece: move.piece,
        captured: move.captured || null,
        promotion: move.promotion || null,
        isCheck: chess.isCheck(),
        isCheckmate: chess.isCheckmate(),
        timeSpentMs: elapsed,
        whiteClockMs: whiteClock,
        blackClockMs: blackClock,
        evalCentipawns: analysis[0]?.scoreCp ?? null,
        analysis,
      },
      event,
      eventHash: nextTranscriptHash(match.transcript_hash, event),
      complete: gameResult.result !== '*',
      result: gameResult.result,
      terminationReason: gameResult.reason,
    });
  }

  async timeout(match, whiteTimedOut) {
    const result = whiteTimedOut ? '0-1' : '1-0';
    const event = { type: 'GAME_COMPLETED', matchId: match.id, result, reason: 'Time forfeit' };
    return this.repository.completeMatch({
      matchId: match.id,
      result,
      terminationReason: 'Time forfeit',
      event,
      eventHash: nextTranscriptHash(match.transcript_hash, event),
    });
  }

  async complete(match, chess) {
    const { result, reason } = resultForGame(chess);
    if (result === '*') return match;
    const event = { type: 'GAME_COMPLETED', matchId: match.id, result, reason };
    return this.repository.completeMatch({
      matchId: match.id,
      result,
      terminationReason: reason,
      event,
      eventHash: nextTranscriptHash(match.transcript_hash, event),
    });
  }
}

module.exports = { MatchRunner, INITIAL_FEN, uciToMove, resultForGame, openingMove };
