import { getDevnetBalances } from '@/services/solana/devnetBalances';
import { isDevnetMarketReady } from '@/services/solana/config';
import {
  IWalletService,
  MarketPositionRequest,
  TransactionReceipt,
  WalletState,
} from './IWalletService';
import type { Instruction } from '@solana/kit';

export interface MobileWalletBridge {
  connect(): Promise<{ address: string; label?: string }>;
  disconnect(): Promise<void>;
  sendTransaction(instructions: Instruction[]): Promise<string>;
}

const disconnectedState = (): WalletState => ({
  isConnected: false,
  address: null,
  solBalance: 0,
  usdcBalance: 0,
  walletName: 'MWA',
  mode: 'mobile-wallet-adapter',
  cluster: 'devnet',
  capabilities: {
    canSignTransactions: true,
    canCreateMarketPositions: isDevnetMarketReady,
  },
});

function normalizeWalletError(error: unknown, action: 'connection' | 'transaction'): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/cancellationexception|cancelled|canceled/i.test(message)) {
    return new Error(`Wallet ${action} was cancelled.`);
  }
  if (/connectionfailedexception|unable to connect to websocket server/i.test(message)) {
    return new Error(
      'Your Android wallet could not start its Mobile Wallet Adapter session. Open and unlock Solflare, disable battery optimization for both Solflare and Feras, then try again.',
    );
  }
  return error instanceof Error ? error : new Error(message);
}

export class MobileWalletService implements IWalletService {
  private bridge: MobileWalletBridge | null = null;
  private state: WalletState = disconnectedState();

  setBridge(bridge: MobileWalletBridge | null): void {
    this.bridge = bridge;
  }

  async connect(): Promise<WalletState> {
    if (!this.bridge) {
      throw new Error('Mobile Wallet Adapter is available only in the Android development build.');
    }

    let account: { address: string; label?: string };
    try {
      account = await this.bridge.connect();
    } catch (error) {
      this.state = disconnectedState();
      throw normalizeWalletError(error, 'connection');
    }
    this.state = {
      ...disconnectedState(),
      isConnected: true,
      address: account.address,
      walletName: 'MWA',
    };
    return this.refreshBalances();
  }

  async disconnect(): Promise<void> {
    await this.bridge?.disconnect();
    this.state = disconnectedState();
  }

  async getState(): Promise<WalletState> {
    return this.state.isConnected ? this.refreshBalances() : { ...this.state };
  }

  async placeMarketPosition(
    request: MarketPositionRequest,
  ): Promise<TransactionReceipt> {
    if (!this.state.isConnected) {
      throw new Error('Connect a devnet wallet before creating a position.');
    }
    if (!isDevnetMarketReady) {
      throw new Error(
        'Devnet positions are not enabled yet. The reviewed Feras market program and Devnet USDC mint must be configured before any wallet transaction can be requested.',
      );
    }

    if (!this.bridge) {
      throw new Error('Mobile Wallet Adapter is not ready. Reconnect your wallet and try again.');
    }
    if (!request.instructions.length) {
      throw new Error('The market transaction did not contain any instructions.');
    }

    let signature: string;
    try {
      signature = await this.bridge.sendTransaction(request.instructions);
    } catch (error) {
      throw normalizeWalletError(error, 'transaction');
    }
    return {
      id: request.correlationId,
      status: 'SUBMITTED',
      cluster: 'devnet',
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      submittedAt: new Date().toISOString(),
    };
  }

  private async refreshBalances(): Promise<WalletState> {
    if (!this.state.address) return { ...this.state };

    try {
      const balances = await getDevnetBalances(this.state.address);
      this.state = { ...this.state, ...balances };
      return { ...this.state };
    } catch (error) {
      // Keep an authenticated wallet connected if its public RPC is temporarily unavailable.
      if (error instanceof Error) {
        throw new Error(`Wallet connected, but live devnet balances could not load: ${error.message}`);
      }
      throw error;
    }
  }
}
