import { IWalletService } from './IWalletService';
import { MobileWalletService } from './MobileWalletService';
import { PrivyWalletService } from './PrivyWalletService';
import { UnavailableWalletService } from './UnavailableWalletService';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const isExpoGo = Constants.appOwnership === 'expo';
export const isMobileWalletRuntime = Platform.OS === 'android' && !isExpoGo;

export const mobileWalletService = new MobileWalletService();
export const privyWalletService = new PrivyWalletService();
const unavailableWalletService = new UnavailableWalletService();

class WalletServiceRouter implements IWalletService {
  private active: IWalletService = privyWalletService;

  usePrivyWallet(): void {
    this.active = privyWalletService;
  }

  useMobileWalletAdapter(): void {
    this.active = mobileWalletService;
  }

  connect = async (walletName?: Parameters<IWalletService['connect']>[0]) => {
    if (walletName === 'MWA') {
      this.active = isMobileWalletRuntime ? mobileWalletService : unavailableWalletService;
    } else {
      this.active = privyWalletService;
    }
    return this.active.connect(walletName);
  };

  disconnect = () => this.active.disconnect();
  getState = () => this.active.getState();
  placeMarketPosition = (request: Parameters<IWalletService['placeMarketPosition']>[0]) =>
    this.active.placeMarketPosition(request);
}

export const walletService = new WalletServiceRouter();

export const walletRuntime = {
  mode: 'privy-embedded' as const,
  productionAdapter: 'privy-embedded' as const,
  hasMwaFallback: isMobileWalletRuntime,
};
