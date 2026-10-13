import { Agent } from '@/types/agent';
import rawAgents from '@/mocks/agents.json';
import rawLeaderboard from '@/mocks/leaderboard.json';
import { simulateNetworkDelay, maybeSimulateError } from './client';

let inMemoryAgents: Agent[] = [...(rawAgents as unknown as Agent[])];

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  name: string;
  elo: number;
  winRate: number;
  totalMatches: number;
  tier: string;
  badgeEmoji: string;
  volumeUsdc: number;
  isUserOwned?: boolean;
}

export async function getAgents(): Promise<Agent[]> {
  await simulateNetworkDelay(350, 600);
  maybeSimulateError(0.0);
  return inMemoryAgents;
}

export async function getAgentById(id: string): Promise<Agent | null> {
  await simulateNetworkDelay(300, 500);
  const found = inMemoryAgents.find((a) => a.id === id);
  return found || null;
}

export async function getUserAgents(): Promise<Agent[]> {
  await simulateNetworkDelay(300, 500);
  return inMemoryAgents.filter((a) => a.isUserOwned);
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  await simulateNetworkDelay(400, 650);
  return rawLeaderboard as unknown as LeaderboardEntry[];
}

export interface SubmitAgentPayload {
  name: string;
  handle: string;
  tagline: string;
  badgeEmoji: string;
  baseModel: string;
  searchAlgorithm: string;
  evalDepth: number;
  stakeSol: number;
}

export async function submitAgent(payload: SubmitAgentPayload): Promise<Agent> {
  await simulateNetworkDelay(800, 1200);
  const newAgent: Agent = {
    id: `agent-user-${Date.now()}`,
    name: payload.name,
    handle: payload.handle.startsWith('@') ? payload.handle : `@${payload.handle}`,
    tagline: payload.tagline,
    avatarUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
    badgeEmoji: payload.badgeEmoji || '🤖',
    tier: 'EXPERIMENTAL',
    status: 'ACTIVE',
    earningsSol: 0,
    totalVolumeUsdc: 0,
    isUserOwned: true,
    stats: {
      elo: 3000,
      peakElo: 3000,
      totalMatches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      avgMoveTimeSec: 1.0,
      aggressionScore: 75,
      accuracyPercent: 95.0,
      favoredOpening: "King's Indian Defense",
      eloHistory: [{ matchIndex: 1, elo: 3000, date: new Date().toISOString().split('T')[0] }],
    },
    architecture: {
      baseModel: payload.baseModel,
      parameters: 'Quantized INT8',
      contextWindow: '32k Tokens',
      searchAlgorithm: payload.searchAlgorithm,
      evalDepth: payload.evalDepth,
      author: 'You (Connected Wallet)',
    },
  };

  inMemoryAgents = [newAgent, ...inMemoryAgents];
  return newAgent;
}
