import { getDevnetBalances } from '@/services/solana/devnetBalances';
import { isDevnetMarketReady } from '@/services/solana/config';
import {
  IWalletService,
  MarketPositionRequest,
  TransactionReceipt,
  WalletName,
  WalletState,
} from './IWalletService';
import type { Instruction } from '@solana/kit';
import { PRIVY_CONFIG } from './privyConfig';
import { getActiveEmbeddedAccount } from './embeddedWallet';

export interface PrivyBridge {
  loginWithOAuth(provider: 'google' | 'apple'): Promise<{ address: string; email?: string }>;
  loginWithEmail(email: string, code: string): Promise<{ address: string; email?: string }>;
  sendEmailCode(email: string): Promise<void>;
  disconnect(): Promise<void>;
  sendTransaction(instructions: Instruction[]): Promise<string>;
}

const disconnectedState = (): WalletState => ({
  isConnected: false,
  address: null,
  solBalance: 0,
  usdcBalance: 0,
  walletName: 'Privy',
  mode: 'privy-embedded',
  cluster: 'devnet',
  capabilities: {
    canSignTransactions: true,
    canCreateMarketPositions: isDevnetMarketReady,
  },
});

export class PrivyWalletService implements IWalletService {
  private bridge: PrivyBridge | null = null;
  private state: WalletState = disconnectedState();

  setBridge(bridge: PrivyBridge | null): void {
    this.bridge = bridge;
  }

  getBridge(): PrivyBridge | null {
    return this.bridge;
  }

  async connect(providerName?: WalletName): Promise<WalletState> {
    if (!this.bridge) {
      // If Privy bridge is not mounted or App ID is pending, provide a helpful message
      if (!PRIVY_CONFIG.isConfigured) {
        throw new Error(
          'Privy App ID is not configured. Set EXPO_PUBLIC_PRIVY_APP_ID in your environment to enable Google & Apple sign-in.'
        );
      }
      throw new Error('Privy Embedded Wallet runtime is initializing. Please try again.');
    }

    const provider = providerName === 'Apple' ? 'apple' : 'google';
    let account: { address: string; email?: string };

    try {
      account = await this.bridge.loginWithOAuth(provider);
    } catch (error) {
      this.state = disconnectedState();
      const message = error instanceof Error ? error.message : String(error);
      if (/cancel|dismiss|closed/i.test(message)) {
        throw new Error(`Sign-in with ${providerName || 'Privy'} was cancelled.`);
      }
      throw new Error(`Failed to sign in with ${providerName || 'Privy'}: ${message}`);
    }

    this.state = {
      ...disconnectedState(),
      isConnected: true,
      address: account.address,
      walletName: providerName || 'Privy',
      mode: 'privy-embedded',
    };

    return this.refreshBalances();
  }

  async disconnect(): Promise<void> {
    await this.bridge?.disconnect();
    this.state = disconnectedState();
  }

  async getState(): Promise<WalletState> {
    if (!this.state.isConnected) {
      const active = await getActiveEmbeddedAccount();
      if (active) {
        this.state = {
          ...disconnectedState(),
          isConnected: true,
          address: active.address,
          walletName:
            active.provider === 'apple'
              ? 'Apple'
              : active.provider === 'google'
              ? 'Google'
              : 'Email',
          mode: 'privy-embedded',
        };
      }
    }
    return this.state.isConnected ? this.refreshBalances() : { ...this.state };
  }

  async placeMarketPosition(
    request: MarketPositionRequest,
  ): Promise<TransactionReceipt> {
    if (!this.state.isConnected || !this.state.address) {
      throw new Error('Please sign in with Google or Apple before creating a position.');
    }
    if (!isDevnetMarketReady) {
      throw new Error(
        'Devnet positions are not enabled yet. The reviewed Feras market program and Devnet USDC mint must be configured.',
      );
    }

    if (!this.bridge) {
      throw new Error('Privy Embedded Wallet bridge is not ready. Reconnect and try again.');
    }
    if (!request.instructions.length) {
      throw new Error('The market transaction did not contain any instructions.');
    }

    let signature: string;
    try {
      signature = await this.bridge.sendTransaction(request.instructions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Transaction signing failed: ${message}`);
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
      // Keep wallet connected even if public devnet RPC is briefly unavailable
      return { ...this.state };
    }
  }
}
