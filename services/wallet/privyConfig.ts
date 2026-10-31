import Constants from 'expo-constants';
import { SOLANA_CONFIG } from '@/services/solana/config';

export interface PrivyAppConfig {
  appId: string;
  clientId?: string;
  solanaCluster: string;
  solanaRpcUrl: string;
  isConfigured: boolean;
}

// In production, these should be supplied via process.env.EXPO_PUBLIC_PRIVY_APP_ID
// or in app.json under expo.extra.privyAppId.
const configuredAppId =
  process.env.EXPO_PUBLIC_PRIVY_APP_ID ||
  Constants.expoConfig?.extra?.privyAppId ||
  'cmvtpoxdq00ls0hl3kv9amzj5';

const configuredClientId =
  process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ||
  Constants.expoConfig?.extra?.privyClientId ||
  'client-WY6etoes1M5Kft6sJmYC2vgqN494RSFn8uViTTmQ3wh4n';

export const PRIVY_CONFIG: PrivyAppConfig = {
  appId: configuredAppId,
  clientId: configuredClientId,
  solanaCluster: 'devnet',
  solanaRpcUrl: SOLANA_CONFIG.rpcUrl,
  isConfigured: Boolean(configuredAppId && configuredAppId.length > 5),
};
