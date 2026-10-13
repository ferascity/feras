import React, { useEffect } from 'react';
import { SOLANA_CONFIG } from '@/services/solana/config';
import {
  isMobileWalletRuntime,
  mobileWalletService,
} from '@/services/wallet';

interface WalletRuntimeProviderProps {
  children: React.ReactNode;
}

function MobileWalletBridge() {
  // This module is required only in an Android development build. Expo Go does
  // not contain the native Mobile Wallet Adapter implementation.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useMobileWallet } = require('@wallet-ui/react-native-kit') as typeof import('@wallet-ui/react-native-kit');
  const { account, connect, disconnect, sendTransaction } = useMobileWallet();

  useEffect(() => {
    mobileWalletService.setBridge({
      connect: async () => {
        const connectedAccount = await connect();
        return {
          address: connectedAccount.address,
          label: connectedAccount.label,
        };
      },
      disconnect,
      sendTransaction,
    });

    return () => mobileWalletService.setBridge(null);
  }, [account, connect, disconnect, sendTransaction]);

  return null;
}

export function WalletRuntimeProvider({ children }: WalletRuntimeProviderProps) {
  if (!isMobileWalletRuntime) {
    return <>{children}</>;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MobileWalletProvider } = require('@wallet-ui/react-native-kit') as typeof import('@wallet-ui/react-native-kit');

  return (
    <MobileWalletProvider
      cluster={{ id: 'solana:devnet', url: SOLANA_CONFIG.rpcUrl }}
      identity={{ name: 'Feras', uri: 'https://feras.app' }}
    >
      <MobileWalletBridge />
      {children}
    </MobileWalletProvider>
  );
}
