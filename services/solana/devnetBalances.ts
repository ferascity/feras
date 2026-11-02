import { SOLANA_CONFIG, USDC_ASSET } from './config';
import {
  getCreditedUsdcBalance,
  getCreditedSolBalance,
} from './swapService';

interface RpcResponse<T> {
  result?: T;
  error?: { message?: string };
}

interface TokenAccountResponse {
  value: Array<{
    account: {
      data: {
        parsed?: {
          info?: {
            tokenAmount?: { uiAmount?: number | null };
          };
        };
      };
    };
  }>;
}

async function rpcRequest<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(SOLANA_CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(`Devnet RPC request failed (${response.status}).`);
  }

  const body = (await response.json()) as RpcResponse<T>;
  if (body.error) {
    throw new Error(body.error.message || 'Devnet RPC returned an error.');
  }
  if (!body.result) {
    throw new Error('Devnet RPC returned no result.');
  }
  return body.result;
}

export async function getDevnetBalances(address: string): Promise<{
  solBalance: number;
  usdcBalance: number;
}> {
  const [creditedUsdc, creditedSol] = await Promise.all([
    getCreditedUsdcBalance(address),
    getCreditedSolBalance(address),
  ]);

  let onChainSol = 0;
  try {
    const solResult = await rpcRequest<{ value: number }>('getBalance', [
      address,
      { commitment: 'confirmed' },
    ]);
    if (solResult?.value) {
      onChainSol = solResult.value / 1_000_000_000;
    }
  } catch {
    // If public devnet RPC is briefly unavailable
  }

  let onChainUsdc = 0;
  if (USDC_ASSET.mintAddress) {
    try {
      const tokenAccounts = await rpcRequest<TokenAccountResponse>(
        'getTokenAccountsByOwner',
        [
          address,
          { mint: USDC_ASSET.mintAddress },
          { encoding: 'jsonParsed', commitment: 'confirmed' },
        ],
      );
      onChainUsdc = tokenAccounts.value.reduce((sum, item) => {
        const amount = item.account.data.parsed?.info?.tokenAmount?.uiAmount;
        return sum + (typeof amount === 'number' && Number.isFinite(amount) ? amount : 0);
      }, 0);
    } catch {
      // Ignore RPC error
    }
  }

  return {
    solBalance: Number((onChainSol + creditedSol).toFixed(4)),
    usdcBalance: Number((onChainUsdc + creditedUsdc).toFixed(2)),
  };
}
