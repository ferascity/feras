import { IWalletService } from './IWalletService';
import { PrivyWalletService } from './PrivyWalletService';
import Constants, { ExecutionEnvironment } from 'expo-constants';

export const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const isMobileWalletRuntime = false;

export const privyWalletService = new PrivyWalletService();
export const walletService: IWalletService = privyWalletService;

export const walletRuntime = {
  mode: 'privy-embedded' as const,
  productionAdapter: 'privy-embedded' as const,
  hasMwaFallback: false,
};

