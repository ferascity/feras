import {
  IWalletService,
  MarketPositionRequest,
  TransactionReceipt,
  WalletState,
} from './IWalletService';

const unavailableState = (): WalletState => ({
  isConnected: false,
  address: null,
  solBalance: 0,
  usdcBalance: 0,
  walletName: null,
  mode: 'unavailable',
  cluster: 'devnet',
  capabilities: {
    canSignTransactions: false,
    canCreateMarketPositions: false,
  },
});

export class UnavailableWalletService implements IWalletService {
  async connect(): Promise<WalletState> {
    throw new Error(
      'Real wallet connection requires the Feras Android development build. Expo Go cannot load Mobile Wallet Adapter.',
    );
  }

  async disconnect(): Promise<void> {}

  async getState(): Promise<WalletState> {
    return unavailableState();
  }

  async placeMarketPosition(
    _request: MarketPositionRequest,
  ): Promise<TransactionReceipt> {
    throw new Error('Connect a real Android Mobile Wallet Adapter wallet first.');
  }
}
