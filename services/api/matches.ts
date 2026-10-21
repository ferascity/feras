import { Match } from '@/types/match';
import { Agent } from '@/types/agent';
import { EngineAnalysisLine, GameReplay, MoveStep, PieceColor, PieceType } from '@/types/chess';
import { FERAS_MARKET_API_URL } from '@/services/solana/config';
import { ApiError } from './client';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function fallbackAgent(color: 'White' | 'Black', matchId: string): Agent {
  const isWhite = color === 'White';
  const name = isWhite ? 'Feras White Engine' : 'Feras Black Engine';
  return {
    id: `${matchId}-${color.toLowerCase()}`,
    name,
    handle: name.toLowerCase().replaceAll(' ', '-'),
    tagline: 'Autonomous Devnet chess agent',
    avatarUrl: '',
    badgeEmoji: isWhite ? 'W' : 'B',
    tier: 'ENGINE',
    status: 'IN_MATCH',
    stats: {
      elo: 2500,
      peakElo: 2500,
      totalMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      avgMoveTimeSec: 0,
      aggressionScore: 50,
      accuracyPercent: 0,
      favoredOpening: 'Devnet opening book',
      eloHistory: [],
    },
    architecture: {
      baseModel: 'Feras engine',
      parameters: 'Devnet',
      contextWindow: 'N/A',
      searchAlgorithm: 'On-chain market replay',
      evalDepth: 0,
      author: 'Feras',
    },
    currentMatchId: matchId,
    earningsSol: 0,
    totalVolumeUsdc: 0,
  };
}

function normalizeAgent(value: unknown, fallback: Agent): Agent {
  const raw = isRecord(value) ? value : {};
  const stats = isRecord(raw.stats) ? raw.stats : {};
  const architecture = isRecord(raw.architecture) ? raw.architecture : {};
  return {
    ...fallback,
    id: stringValue(raw.id, fallback.id),
    name: stringValue(raw.name, fallback.name),
    handle: stringValue(raw.handle, fallback.handle),
    badgeEmoji: stringValue(raw.badgeEmoji, fallback.badgeEmoji),
    stats: {
      ...fallback.stats,
      elo: numberValue(stats.elo, fallback.stats.elo),
      peakElo: numberValue(stats.peakElo, fallback.stats.peakElo),
      favoredOpening: stringValue(stats.favoredOpening, fallback.stats.favoredOpening),
    },
    architecture: {
      ...fallback.architecture,
      baseModel: stringValue(architecture.baseModel, fallback.architecture.baseModel),
      parameters: stringValue(architecture.parameters, fallback.architecture.parameters),
      searchAlgorithm: stringValue(architecture.searchAlgorithm, fallback.architecture.searchAlgorithm),
      evalDepth: numberValue(architecture.evalDepth, fallback.architecture.evalDepth),
    },
  };
}

function asSquare(value: unknown): string | null {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value) ? value : null;
}

function asPiece(value: unknown): PieceType | null {
  return value === 'p' || value === 'n' || value === 'b' || value === 'r' || value === 'q' || value === 'k' ? value : null;
}

function normalizeAnalysis(value: unknown): EngineAnalysisLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (!isRecord(line)) return [];
    const pv = Array.isArray(line.principalVariation) && line.principalVariation.every((move) => typeof move === 'string')
      ? line.principalVariation as string[]
      : [];
    const depth = numberValue(line.depth, 0);
    if (depth <= 0 || pv.length === 0) return [];
    return [{ depth, multiPv: numberValue(line.multiPv, 1), scoreCp: typeof line.scoreCp === 'number' ? line.scoreCp : null, scoreMate: typeof line.scoreMate === 'number' ? line.scoreMate : null, principalVariation: pv }];
  });
}

function normalizeReplay(value: unknown, id: string): GameReplay {
  const raw = isRecord(value) ? value : {};
  const moves: MoveStep[] = !Array.isArray(raw.moves) ? [] : raw.moves.flatMap((value, index) => {
    if (!isRecord(value)) return [];
    const from = asSquare(value.from);
    const to = asSquare(value.to);
    const piece = asPiece(value.piece);
    const color: PieceColor | null = value.color === 'w' || value.color === 'b' ? value.color : null;
    if (!from || !to || !piece || !color) return [];
    return [{
      ply: numberValue(value.ply, index + 1), from, to, piece, color,
      san: stringValue(value.san, `${from}-${to}`), fen: stringValue(value.fen, INITIAL_FEN),
      evalCentipawns: typeof value.evalCentipawns === 'number' ? value.evalCentipawns : undefined,
      analysis: normalizeAnalysis(value.analysis),
      winProbabilityWhite: numberValue(value.winProbabilityWhite, 0.5),
      timeSpentSec: numberValue(value.timeSpentSec, 0),
      captured: asPiece(value.captured) || undefined,
      promotion: value.promotion === 'q' || value.promotion === 'r' || value.promotion === 'b' || value.promotion === 'n' ? value.promotion : undefined,
      isCheck: value.isCheck === true,
      isCheckmate: value.isCheckmate === true,
    }];
  });
  const result = raw.result === '1-0' || raw.result === '0-1' || raw.result === '1/2-1/2' ? raw.result : '*';
  return { matchId: stringValue(raw.matchId, id), initialFen: stringValue(raw.initialFen, INITIAL_FEN), moves, result, terminationReason: stringValue(raw.terminationReason, 'In progress') };
}

function normalizeMatch(value: unknown): Match {
  const raw = isRecord(value) ? value : {};
  const id = stringValue(raw.id, 'unknown-market');
  const whiteAgent = normalizeAgent(raw.whiteAgent, fallbackAgent('White', id));
  const blackAgent = normalizeAgent(raw.blackAgent, fallbackAgent('Black', id));
  const estimates = isRecord(raw.marketEstimates) ? raw.marketEstimates : {};
  const status = raw.status === 'UPCOMING' || raw.status === 'COMPLETED' ? raw.status : 'LIVE';

  return {
    id,
    title: stringValue(raw.title, 'Feras Devnet Market'),
    category: raw.category === 'CHAMPIONSHIP' || raw.category === 'GRAND_PRIX' || raw.category === 'HIGH_STAKES' || raw.category === 'BENCHMARK'
      ? raw.category
      : 'HIGH_STAKES',
    status,
    whiteAgent,
    blackAgent,
    currentPly: numberValue(raw.currentPly, 0),
    totalPlies: numberValue(raw.totalPlies, 0),
    timeControl: stringValue(raw.timeControl, 'Devnet'),
    viewerCount: numberValue(raw.viewerCount, 0),
    poolVolumeUsdc: numberValue(raw.poolVolumeUsdc, 0),
    marketEstimates: {
      whiteMultiplier: numberValue(estimates.whiteMultiplier, 2),
      drawMultiplier: numberValue(estimates.drawMultiplier, 3),
      blackMultiplier: numberValue(estimates.blackMultiplier, 2),
    },
    currentFen: stringValue(raw.currentFen, INITIAL_FEN),
    replay: normalizeReplay(raw.replay, id),
    startedAt: stringValue(raw.startedAt, new Date().toISOString()),
    evalScore: numberValue(raw.evalScore, 0),
    engineAnalysis: normalizeAnalysis(raw.engineAnalysis),
  };
}

async function requestMatches(path: string): Promise<Match[]> {
  if (!FERAS_MARKET_API_URL) {
    throw new ApiError('Devnet market API is not configured.', 503);
  }
  const response = await fetch(`${FERAS_MARKET_API_URL}${path}`);
  if (!response.ok) {
    throw new ApiError(`Devnet market API request failed (${response.status}).`, response.status);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new ApiError('Devnet market API returned an invalid match list.', 502);
  }
  return payload.map(normalizeMatch);
}

export async function getLiveMatches(): Promise<Match[]> {
  return requestMatches('/v1/matches?status=LIVE');
}

export async function getAllMatches(): Promise<Match[]> {
  return requestMatches('/v1/matches');
}

export async function getMatchById(id: string): Promise<Match | null> {
  if (!FERAS_MARKET_API_URL) {
    throw new ApiError('Devnet market API is not configured.', 503);
  }
  const response = await fetch(
    `${FERAS_MARKET_API_URL}/v1/matches/${encodeURIComponent(id)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new ApiError(`Devnet market API request failed (${response.status}).`, response.status);
  }
  return normalizeMatch(await response.json());
}
