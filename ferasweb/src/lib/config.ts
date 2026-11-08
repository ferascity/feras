const env = import.meta.env;

const trimSlash = (value: string | undefined) => (value ?? '').trim().replace(/\/+$/, '');

export const CONFIG = {
  privyAppId:
    env.VITE_PRIVY_APP_ID?.trim() || 'cmvtpoxdq00ls0hl3kv9amzj5',
  // Web uses the same Privy app as mobile. The mobile app client is scoped to
  // native app identifiers and disallows browser origins, so it is optional here:
  // set VITE_PRIVY_CLIENT_ID only after adding the web origin to that client's
  // allowed origins in the Privy dashboard.
  privyClientId: env.VITE_PRIVY_CLIENT_ID?.trim() || '',
  marketApiUrl: trimSlash(env.VITE_FERAS_MARKET_API_URL) || 'http://127.0.0.1:8787',
  rpcUrl: env.VITE_SOLANA_RPC_URL?.trim() || 'https://api.devnet.solana.com',
  programId:
    env.VITE_FERAS_MARKET_PROGRAM_ID?.trim() ||
    '3UJi7D53Cbj5TLGbbxFCzqW9vE7Ji5N5KKEdbQMWFaFA',
  usdcMint:
    env.VITE_DEVNET_USDC_MINT?.trim() ||
    'CwhBMtAs7tAHSabWrW2Dg2hgQ7Ktt7pW86UR35Be9VrU',
  appStoreUrl: env.VITE_APP_STORE_URL?.trim() || '',
  playStoreUrl: env.VITE_PLAY_STORE_URL?.trim() || '',
  cluster: 'devnet' as const,
};

export const EXPLORER_URL = 'https://explorer.solana.com';
