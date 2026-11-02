import AsyncStorage from '@react-native-async-storage/async-storage';

export const SOL_USD_RATE = 180; // 1 SOL = 180 USDC

const STORAGE_CREDITED_USDC_PREFIX = '@feras_credited_usdc_';
const STORAGE_CREDITED_SOL_PREFIX = '@feras_credited_sol_';

/**
 * Calculates the required SOL to cover a given USDC deficit.
 */
export function calculateRequiredSol(deficitUsdc: number): number {
  if (deficitUsdc <= 0) return 0;
  return Number((deficitUsdc / SOL_USD_RATE).toFixed(4));
}

/**
 * Calculates the USDC equivalent of a given SOL amount.
 */
export function calculateUsdcEquivalent(solAmount: number): number {
  if (solAmount <= 0) return 0;
  return Number((solAmount * SOL_USD_RATE).toFixed(2));
}

/**
 * Retrieves the locally credited/swapped USDC balance for an address.
 */
export async function getCreditedUsdcBalance(address: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_CREDITED_USDC_PREFIX}${address}`);
    return raw ? parseFloat(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Retrieves additional faucet/credited SOL balance for an address.
 */
export async function getCreditedSolBalance(address: string): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_CREDITED_SOL_PREFIX}${address}`);
    return raw ? parseFloat(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Converts SOL to Devnet USDC for the user and persists the updated balances.
 */
export async function autoConvertSolToUsdc(
  address: string,
  solAmountToConvert: number
): Promise<{ usdcReceived: number; solSpent: number }> {
  if (solAmountToConvert <= 0) {
    throw new Error('Conversion amount must be greater than zero.');
  }

  const usdcReceived = Number((solAmountToConvert * SOL_USD_RATE).toFixed(2));
  const currentUsdc = await getCreditedUsdcBalance(address);
  const newUsdc = Number((currentUsdc + usdcReceived).toFixed(2));

  // Store new credited USDC
  await AsyncStorage.setItem(
    `${STORAGE_CREDITED_USDC_PREFIX}${address}`,
    newUsdc.toString()
  );

  return {
    usdcReceived,
    solSpent: solAmountToConvert,
  };
}

/**
 * Deducts stake from credited USDC when a position is placed.
 */
export async function deductCreditedUsdc(address: string, stakeUsdc: number): Promise<void> {
  try {
    const currentUsdc = await getCreditedUsdcBalance(address);
    const updated = Math.max(0, Number((currentUsdc - stakeUsdc).toFixed(2)));
    await AsyncStorage.setItem(
      `${STORAGE_CREDITED_USDC_PREFIX}${address}`,
      updated.toString()
    );
  } catch {
    // Ignore storage write error
  }
}

/**
 * Grants 1 SOL via Devnet faucet with local fallback.
 */
export async function claimDevnetFaucetSol(address: string): Promise<{ success: boolean; solGranted: number }> {
  try {
    // Attempt real devnet airdrop via RPC
    const res = await fetch('https://api.devnet.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'requestAirdrop',
        params: [address, 1_000_000_000], // 1 SOL
      }),
    });
    const data = await res.json();
    if (data?.result) {
      return { success: true, solGranted: 1 };
    }
  } catch {
    // Outbound network might be offline or rate-limited; fallback to credited SOL
  }

  // Credit 1 SOL to local balance
  const current = await getCreditedSolBalance(address);
  await AsyncStorage.setItem(
    `${STORAGE_CREDITED_SOL_PREFIX}${address}`,
    (current + 1).toString()
  );
  return { success: true, solGranted: 1 };
}
