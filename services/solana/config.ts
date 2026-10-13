export type SolanaCluster = 'devnet';

export interface TokenAssetConfig {
  symbol: 'USDC';
  name: string;
  decimals: 6;
  mintAddress: string | null;
  isConfigured: boolean;
}

const configuredMint = process.env.EXPO_PUBLIC_DEVNET_USDC_MINT?.trim() || null;
const looksLikeSolanaAddress = (value: string) =>
  value.length >= 32 && value.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);

const LOCAL_MARKET_PROGRAM_ID = '3UJi7D53Cbj5TLGbbxFCzqW9vE7Ji5N5KKEdbQMWFaFA';
const configuredProgramId =
  process.env.EXPO_PUBLIC_FERAS_MARKET_PROGRAM_ID?.trim() || null;
const configuredMarketReady =
  process.env.EXPO_PUBLIC_FERAS_DEVNET_MARKET_READY?.trim() === 'true';
const configuredMarketApiUrl =
  process.env.EXPO_PUBLIC_FERAS_MARKET_API_URL?.trim().replace(/\/$/, '') || null;

export const FERAS_MARKET_PROGRAM_ID =
  configuredProgramId && looksLikeSolanaAddress(configuredProgramId)
    ? configuredProgramId
    : LOCAL_MARKET_PROGRAM_ID;

export const SOLANA_CONFIG = {
  cluster: 'devnet' as const,
  rpcUrl:
    process.env.EXPO_PUBLIC_SOLANA_RPC_URL?.trim() ||
    'https://api.devnet.solana.com',
  explorerCluster: 'devnet' as const,
};

export const USDC_ASSET: TokenAssetConfig = {
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  mintAddress:
    configuredMint && looksLikeSolanaAddress(configuredMint) ? configuredMint : null,
  isConfigured: Boolean(configuredMint && looksLikeSolanaAddress(configuredMint)),
};

export const FERAS_MARKET_API_URL = configuredMarketApiUrl;

// A public program id by itself is not sufficient evidence that a market is safe
// to use. This must only be enabled after the deployed program and market
// configuration have been reviewed on devnet.
export const isDevnetMarketReady =
  configuredMarketReady &&
  USDC_ASSET.isConfigured &&
  Boolean(configuredProgramId) &&
  Boolean(FERAS_MARKET_API_URL);

export const getUsdcDisplayName = () => 'Devnet USDC';
