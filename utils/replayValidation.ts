import { Chess, Square } from 'chess.js';
import { GameReplay, MoveStep } from '@/types/chess';

export class InvalidReplayError extends Error {
  constructor(
    public readonly matchId: string,
    public readonly ply: number,
    message: string,
  ) {
    super(`Invalid replay ${matchId} at ply ${ply}: ${message}`);
    this.name = 'InvalidReplayError';
  }
}

const canonicalFen = (fen: string, matchId: string, ply: number) => {
  try {
    return new Chess(fen).fen();
  } catch {
    throw new InvalidReplayError(matchId, ply, 'malformed FEN');
  }
};

const getPromotion = (move: MoveStep) => {
  if (move.promotion) return move.promotion;
  const sanPromotion = move.san.match(/=([QRBN])/i)?.[1]?.toLowerCase();
  return sanPromotion as MoveStep['promotion'] | undefined;
};

export function validateAndCanonicalizeReplay(replay: GameReplay): GameReplay {
  const chess = new Chess(replay.initialFen);

  const moves = replay.moves.map((step, index) => {
    const expectedPly = index + 1;
    if (step.ply !== expectedPly) {
      throw new InvalidReplayError(
        replay.matchId,
        step.ply,
        `expected sequential ply ${expectedPly}`,
      );
    }

    let appliedMove;
    try {
      appliedMove = chess.move({
        from: step.from as Square,
        to: step.to as Square,
        promotion: getPromotion(step),
      });
    } catch {
      throw new InvalidReplayError(
        replay.matchId,
        step.ply,
        `illegal move ${step.from}-${step.to}`,
      );
    }

    if (!appliedMove) {
      throw new InvalidReplayError(
        replay.matchId,
        step.ply,
        `illegal move ${step.from}-${step.to}`,
      );
    }

    const derivedFen = chess.fen();
    const suppliedFen = canonicalFen(step.fen, replay.matchId, step.ply);
    if (derivedFen !== suppliedFen) {
      throw new InvalidReplayError(
        replay.matchId,
        step.ply,
        'stored position does not match the move history',
      );
    }

    if (step.san !== appliedMove.san) {
      throw new InvalidReplayError(
        replay.matchId,
        step.ply,
        `stored SAN ${step.san} does not match ${appliedMove.san}`,
      );
    }

    return {
      ...step,
      fen: derivedFen,
      san: appliedMove.san,
      color: appliedMove.color,
      piece: appliedMove.piece,
      captured: appliedMove.captured,
      promotion: appliedMove.promotion as MoveStep['promotion'],
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
    } satisfies MoveStep;
  });

  return {
    ...replay,
    initialFen: canonicalFen(replay.initialFen, replay.matchId, 0),
    moves,
  };
}
