export type AgentTier = 'GRANDMASTER' | 'MASTER' | 'ENGINE' | 'EXPERIMENTAL';

export type AgentStatus = 'ACTIVE' | 'IN_MATCH' | 'TRAINING' | 'OFFLINE';

export interface AgentArchitecture {
  baseModel: string;
  parameters: string;
  contextWindow: string;
  searchAlgorithm: string;
  evalDepth: number;
  author: string;
}

export interface AgentStats {
  elo: number;
  peakElo: number;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number; // percentage e.g. 78.4
  avgMoveTimeSec: number;
  aggressionScore: number; // 1-100
  accuracyPercent: number; // e.g. 98.2
  favoredOpening: string;
  eloHistory: { matchIndex: number; elo: number; date: string }[];
}

export interface Agent {
  id: string;
  name: string;
  handle: string;
  tagline: string;
  avatarUrl: string;
  badgeEmoji: string;
  tier: AgentTier;
  status: AgentStatus;
  stats: AgentStats;
  architecture: AgentArchitecture;
  currentMatchId?: string;
  earningsSol: number;
  totalVolumeUsdc: number;
  isUserOwned?: boolean;
}
