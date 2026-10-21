export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export interface EngineAnalysisLine {
  depth: number;
  multiPv: number;
  scoreCp: number | null;
  scoreMate: number | null;
  principalVariation: string[];
}

export interface MoveStep {
  ply: number;
  from: string;
  to: string;
  piece: PieceType;
  color: PieceColor;
  san: string;
  fen: string;
  evalCentipawns?: number; // e.g. +140 or -280
  analysis?: EngineAnalysisLine[];
  winProbabilityWhite: number; // 0.0 to 1.0 (e.g. 0.58)
  commentary?: string;
  timeSpentSec?: number;
  captured?: PieceType;
  promotion?: 'q' | 'r' | 'b' | 'n';
  isCheck?: boolean;
  isCheckmate?: boolean;
}

export interface GameReplay {
  matchId: string;
  initialFen: string;
  moves: MoveStep[];
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  terminationReason: string; // "Checkmate", "Resignation", "Time out"
}
