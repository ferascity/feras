import type { Instruction } from '@solana/kit';

export type WalletName = 'MWA';
export type WalletMode = 'unavailable' | 'mobile-wallet-adapter';
import type { SolanaCluster } from '@/services/solana/config';

export type { SolanaCluster } from '@/services/solana/config';
export type MarketOutcome = 'WHITE' | 'BLACK' | 'DRAW';

export interface WalletCapabilities {
  canSignTransactions: boolean;
  canCreateMarketPositions: boolean;
}

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  solBalance: number;
  usdcBalance: number;
  walletName: WalletName | null;
  mode: WalletMode;
  cluster: SolanaCluster;
  capabilities: WalletCapabilities;
}

export interface MarketPositionRequest {
  matchId: string;
  amountUsdc: number;
  outcome: MarketOutcome;
  estimatedMultiplier: number;
  instructions: Instruction[];
  correlationId: string;
}

export type TransactionStatus =
  | 'PREVIEW_CONFIRMED'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'FAILED';

export interface TransactionReceipt {
  id: string;
  status: TransactionStatus;
  cluster: SolanaCluster;
  signature: string | null;
  explorerUrl: string | null;
  submittedAt: string;
}

export interface IWalletService {
  connect(walletName?: WalletName): Promise<WalletState>;
  disconnect(): Promise<void>;
  getState(): Promise<WalletState>;
  placeMarketPosition(request: MarketPositionRequest): Promise<TransactionReceipt>;
}
