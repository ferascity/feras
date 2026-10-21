import { Agent } from './agent';
import { EngineAnalysisLine, GameReplay } from './chess';

export type MatchStatus = 'LIVE' | 'UPCOMING' | 'COMPLETED';

export interface MarketEstimates {
  whiteMultiplier: number;
  blackMultiplier: number;
  drawMultiplier: number;
  lastTickDirection?: 'UP' | 'DOWN' | 'EQUAL';
}

export interface Match {
  id: string;
  title: string;
  category: 'CHAMPIONSHIP' | 'GRAND_PRIX' | 'HIGH_STAKES' | 'BENCHMARK';
  status: MatchStatus;
  whiteAgent: Agent;
  blackAgent: Agent;
  currentPly: number;
  totalPlies?: number;
  timeControl: string; // e.g. "3+2 Blitz"
  viewerCount: number;
  poolVolumeUsdc: number;
  marketEstimates: MarketEstimates;
  currentFen: string;
  replay: GameReplay;
  startedAt: string;
  evalScore: number; // e.g. +1.2
  engineAnalysis?: EngineAnalysisLine[];
}
