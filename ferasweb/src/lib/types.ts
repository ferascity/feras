export type MatchStatus = 'LIVE' | 'UPCOMING' | 'COMPLETED';

export type MatchCategory =
  | 'CHAMPIONSHIP'
  | 'GRAND_PRIX'
  | 'HIGH_STAKES'
  | 'BENCHMARK'
  | 'DEVNET';

export type MarketOutcome = 'WHITE' | 'DRAW' | 'BLACK';

export interface AgentStats {
  elo: number;
  peakElo: number;
  winRate: number;
  favoredOpening: string;
}

export interface AgentArchitecture {
  baseModel: string;
  parameters: string;
  searchAlgorithm: string;
  evalDepth: number;
}

export interface Agent {
  id: string;
  name: string;
  handle: string;
  tagline: string;
  badgeEmoji: string;
  tier: string;
  status: string;
  stats: AgentStats;
  architecture: AgentArchitecture;
  earningsSol: number;
  totalVolumeUsdc: number;
  isUserOwned?: boolean;
}

export interface MarketEstimates {
  whiteMultiplier: number;
  blackMultiplier: number;
  drawMultiplier: number;
  lastTickDirection?: 'UP' | 'DOWN' | 'EQUAL';
}

export interface MoveStep {
  ply: number;
  from: string;
  to: string;
  piece: string;
  color: 'w' | 'b';
  san: string;
  fen: string;
  evalCentipawns?: number;
  timeSpentSec: number;
  captured?: string;
  isCheck?: boolean;
  isCheckmate?: boolean;
  winProbabilityWhite: number;
}

export interface GameReplay {
  matchId: string;
  initialFen: string;
  moves: MoveStep[];
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  terminationReason: string;
}

export interface Match {
  id: string;
  title: string;
  category: MatchCategory;
  status: MatchStatus;
  whiteAgent: Agent;
  blackAgent: Agent;
  currentPly: number;
  totalPlies?: number;
  timeControl: string;
  viewerCount: number;
  poolVolumeUsdc: number;
  marketEstimates: MarketEstimates;
  currentFen: string;
  replay: GameReplay;
  startedAt: string;
  evalScore: number;
  result?: MarketOutcome | null;
  marketAddress?: string;
  vaultAddress?: string;
  marketLockTime?: string | null;
  isDemo?: boolean;
}

export type PositionStatus = 'ACTIVE' | 'WON' | 'LOST' | 'CANCELLED';

export interface TransactionReceipt {
  signature: string | null;
  explorerUrl: string | null;
  cluster: 'devnet';
}

export interface MarketPosition {
  id: string;
  matchId: string;
  matchTitle: string;
  selectedAgentId: string;
  selectedAgentName: string;
  outcome: MarketOutcome;
  stakeUsdc: number;
  estimatedMultiplier: number;
  estimatedReturnUsdc: number;
  status: PositionStatus;
  placedAt: string;
  settledAt?: string;
  receipt: TransactionReceipt;
}

export interface PositionDraft {
  matchId: string;
  matchTitle: string;
  selectedAgentId: string;
  selectedAgentName: string;
  outcome: MarketOutcome;
  stakeUsdc: number;
  estimatedMultiplier: number;
}
