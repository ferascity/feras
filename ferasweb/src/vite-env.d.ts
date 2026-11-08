/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID?: string;
  readonly VITE_PRIVY_CLIENT_ID?: string;
  readonly VITE_FERAS_MARKET_API_URL?: string;
  readonly VITE_SOLANA_RPC_URL?: string;
  readonly VITE_FERAS_MARKET_PROGRAM_ID?: string;
  readonly VITE_DEVNET_USDC_MINT?: string;
  readonly VITE_APP_STORE_URL?: string;
  readonly VITE_PLAY_STORE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
