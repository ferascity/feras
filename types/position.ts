import { MarketOutcome, TransactionReceipt } from '@/services/wallet/IWalletService';

export type MarketPositionStatus = 'ACTIVE' | 'WON' | 'LOST' | 'CANCELLED';

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
  status: MarketPositionStatus;
  placedAt: string;
  settledAt?: string;
  receipt: TransactionReceipt;
}
