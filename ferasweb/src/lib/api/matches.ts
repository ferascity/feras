import demoMatchesRaw from '../../data/demo-matches.json';
import { CONFIG } from '../config';
import type {
  Agent,
  GameReplay,
  Match,
  MatchCategory,
  MatchStatus,
  MoveStep,
} from '../types';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const REQUEST_TIMEOUT_MS = 9000;

export interface MatchesResult {
  matches: Match[];
  source: 'live' | 'demo';
  error: string | null;
}

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
    badgeEmoji: isWhite ? 'W' : 'B',
    tier: 'ENGINE',
    status: 'IN_MATCH',
    stats: {
      elo: 2500,
      peakElo: 2500,
      winRate: 0,
      favoredOpening: 'Devnet opening book',
    },
    architecture: {
      baseModel: 'Feras engine',
      parameters: 'Devnet',
      searchAlgorithm: 'On-chain market replay',
      evalDepth: 0,
    },
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
    tagline: stringValue(raw.tagline, fallback.tagline),
    badgeEmoji: stringValue(raw.badgeEmoji, fallback.badgeEmoji),
    tier: stringValue(raw.tier, fallback.tier),
    status: stringValue(raw.status, fallback.status),
    stats: {
      elo: numberValue(stats.elo, fallback.stats.elo),
      peakElo: numberValue(stats.peakElo, fallback.stats.peakElo),
      winRate: numberValue(stats.winRate, fallback.stats.winRate),
      favoredOpening: stringValue(stats.favoredOpening, fallback.stats.favoredOpening),
    },
    architecture: {
      baseModel: stringValue(architecture.baseModel, fallback.architecture.baseModel),
      parameters: stringValue(architecture.parameters, fallback.architecture.parameters),
      searchAlgorithm: stringValue(
        architecture.searchAlgorithm,
        fallback.architecture.searchAlgorithm,
      ),
      evalDepth: numberValue(architecture.evalDepth, fallback.architecture.evalDepth),
    },
    earningsSol: numberValue(raw.earningsSol, fallback.earningsSol),
    totalVolumeUsdc: numberValue(raw.totalVolumeUsdc, fallback.totalVolumeUsdc),
    isUserOwned: raw.isUserOwned === true,
  };
}

function asSquare(value: unknown): string | null {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value) ? value : null;
}

function asPiece(value: unknown): string | null {
  return value === 'p' || value === 'n' || value === 'b' || value === 'r' || value === 'q' || value === 'k'
    ? value
    : null;
}

function normalizeReplay(value: unknown, id: string): GameReplay {
  const raw = isRecord(value) ? value : {};
  const moves: MoveStep[] = !Array.isArray(raw.moves)
    ? []
    : raw.moves.flatMap((move, index) => {
        if (!isRecord(move)) return [];
        const from = asSquare(move.from);
        const to = asSquare(move.to);
        const piece = asPiece(move.piece);
        const color = move.color === 'w' || move.color === 'b' ? move.color : null;
        if (!from || !to || !piece || !color) return [];
        return [
          {
            ply: numberValue(move.ply, index + 1),
            from,
            to,
            piece,
            color,
            san: stringValue(move.san, `${from}-${to}`),
            fen: stringValue(move.fen, INITIAL_FEN),
            evalCentipawns:
              typeof move.evalCentipawns === 'number' ? move.evalCentipawns : undefined,
            timeSpentSec: numberValue(move.timeSpentSec, 0),
            captured: asPiece(move.captured) ?? undefined,
            isCheck: move.isCheck === true,
            isCheckmate: move.isCheckmate === true,
            winProbabilityWhite: numberValue(move.winProbabilityWhite, 0.5),
          },
        ];
      });
  const result =
    raw.result === '1-0' || raw.result === '0-1' || raw.result === '1/2-1/2'
      ? raw.result
      : '*';
  return {
    matchId: stringValue(raw.matchId, id),
    initialFen: stringValue(raw.initialFen, INITIAL_FEN),
    moves,
    result,
    terminationReason: stringValue(raw.terminationReason, 'In progress'),
  };
}

function normalizeStatus(value: unknown): MatchStatus {
  if (value === 'UPCOMING' || value === 'SCHEDULED' || value === 'OPEN' || value === 'LOCKED') {
    return 'UPCOMING';
  }
  if (value === 'COMPLETED' || value === 'FINAL') return 'COMPLETED';
  return 'LIVE';
}

function normalizeCategory(value: unknown): MatchCategory {
  return value === 'CHAMPIONSHIP' ||
    value === 'GRAND_PRIX' ||
    value === 'HIGH_STAKES' ||
    value === 'BENCHMARK' ||
    value === 'DEVNET'
    ? value
    : 'HIGH_STAKES';
}

export function normalizeMatch(value: unknown): Match {
  const raw = isRecord(value) ? value : {};
  const id = stringValue(raw.id, 'unknown-market');
  const whiteAgent = normalizeAgent(raw.whiteAgent, fallbackAgent('White', id));
  const blackAgent = normalizeAgent(raw.blackAgent, fallbackAgent('Black', id));
  const estimates = isRecord(raw.marketEstimates) ? raw.marketEstimates : {};
  const result =
    raw.result === 'WHITE' || raw.result === 'DRAW' || raw.result === 'BLACK'
      ? raw.result
      : null;

  return {
    id,
    title: stringValue(raw.title, 'Feras Devnet Market'),
    category: normalizeCategory(raw.category),
    status: normalizeStatus(raw.status),
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
      lastTickDirection:
        estimates.lastTickDirection === 'UP' ||
        estimates.lastTickDirection === 'DOWN' ||
        estimates.lastTickDirection === 'EQUAL'
          ? estimates.lastTickDirection
          : undefined,
    },
    currentFen: stringValue(raw.currentFen, INITIAL_FEN),
    replay: normalizeReplay(raw.replay, id),
    startedAt: stringValue(raw.startedAt, new Date().toISOString()),
    evalScore: numberValue(raw.evalScore, 0),
    result,
    marketAddress: typeof raw.marketAddress === 'string' ? raw.marketAddress : undefined,
    vaultAddress: typeof raw.vaultAddress === 'string' ? raw.vaultAddress : undefined,
    marketLockTime:
      typeof raw.marketLockTime === 'string' ? raw.marketLockTime : null,
  };
}

async function request(path: string): Promise<Match[]> {
  const response = await fetch(`${CONFIG.marketApiUrl}${path}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Market API responded with ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('Market API returned an unexpected payload');
  }
  return payload.map(normalizeMatch);
}

export function sortMatches(matches: Match[]): Match[] {
  const weight: Record<MatchStatus, number> = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 };
  return [...matches].sort((a, b) => {
    const byStatus = weight[a.status] - weight[b.status];
    if (byStatus !== 0) return byStatus;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
}

export function demoMatches(): Match[] {
  return (demoMatchesRaw as unknown[]).map((match) => ({
    ...normalizeMatch(match),
    isDemo: true,
  }));
}

export async function loadMatches(status?: MatchStatus): Promise<MatchesResult> {
  const query = status ? `?status=${status}` : '';
  try {
    const matches = await request(`/v1/matches${query}`);
    const mapped = sortMatches(matches.map((match) => ({ ...match, isDemo: false })));
    if (mapped.length === 0 && !status) {
      return { matches: demoMatches(), source: 'demo', error: null };
    }
    return { matches: mapped, source: 'live', error: null };
  } catch (error) {
    const demo = demoMatches().filter((match) => !status || match.status === status);
    return {
      matches: sortMatches(demo),
      source: 'demo',
      error:
        error instanceof Error
          ? error.message
          : 'The market API could not be reached.',
    };
  }
}

export async function loadMatch(id: string): Promise<Match | null> {
  const response = await fetch(`${CONFIG.marketApiUrl}/v1/matches/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Market API responded with ${response.status}`);
  return normalizeMatch(await response.json());
}
