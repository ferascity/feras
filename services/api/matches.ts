import { Match } from '@/types/match';
import { Agent } from '@/types/agent';
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

function normalizeMatch(value: unknown): Match {
  const raw = isRecord(value) ? value : {};
  const id = stringValue(raw.id, 'unknown-market');
  const whiteAgent = fallbackAgent('White', id);
  const blackAgent = fallbackAgent('Black', id);
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
    replay: {
      matchId: id,
      initialFen: INITIAL_FEN,
      moves: [],
      result: '*',
      terminationReason: 'Market is live on Devnet',
    },
    startedAt: stringValue(raw.startedAt, new Date().toISOString()),
    evalScore: numberValue(raw.evalScore, 0),
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
