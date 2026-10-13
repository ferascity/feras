import { IWalletService } from './IWalletService';
import { MobileWalletService } from './MobileWalletService';
import { UnavailableWalletService } from './UnavailableWalletService';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const isExpoGo = Constants.appOwnership === 'expo';
export const isMobileWalletRuntime = Platform.OS === 'android' && !isExpoGo;

export const mobileWalletService = new MobileWalletService();
const unavailableWalletService = new UnavailableWalletService();

class WalletServiceRouter implements IWalletService {
  private active: IWalletService = isMobileWalletRuntime
    ? mobileWalletService
    : unavailableWalletService;

  useMobileWalletAdapter(): void {
    this.active = mobileWalletService;
  }

  connect = (walletName?: Parameters<IWalletService['connect']>[0]) =>
    this.active.connect(walletName);
  disconnect = () => this.active.disconnect();
  getState = () => this.active.getState();
  placeMarketPosition = (request: Parameters<IWalletService['placeMarketPosition']>[0]) =>
    this.active.placeMarketPosition(request);
}

// Expo Go cannot load Mobile Wallet Adapter native modules. The Android
// development build will replace this binding with the MWA implementation.
export const walletService = new WalletServiceRouter();

export const walletRuntime = {
  mode: isMobileWalletRuntime ? 'mobile-wallet-adapter' : 'unavailable',
  productionAdapter: 'mobile-wallet-adapter' as const,
};
