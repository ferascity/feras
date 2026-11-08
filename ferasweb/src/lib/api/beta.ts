import { CONFIG } from '../config';

const REQUEST_TIMEOUT_MS = 15000;

export interface BetaGrant {
  status: 'PENDING' | 'CONFIRMED';
  requestedAt: string;
  confirmedAt: string | null;
  explorerUrl: string | null;
}

export interface BetaLimits {
  starterSol: number;
  starterUsdc: number;
  solToUsdcRate: number;
  swapMinUsdc: number;
  swapMaxUsdc: number;
  dailyUsdc: number;
  dailySol: number;
}

export interface BetaStatus {
  wallet: string;
  enabled: boolean;
  disabledReason: string | null;
  tester: {
    inviteCode: string | null;
    claimedAt: string | null;
    blocked: boolean;
  } | null;
  grant: BetaGrant | null;
  canClaim: boolean;
  canTopUp: boolean;
  limits: BetaLimits;
  usage: {
    usdcToday: number;
    solToday: number;
    usdcRemaining: number;
  };
  float: {
    address: string | null;
    usdc: number | null;
    sol: number | null;
  };
}

export interface BetaSwapInstruction {
  programId: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
}

export interface BetaSwapQuote {
  swapId: number;
  instructions: BetaSwapInstruction[];
  usdc: number;
  sol: number;
  rate: number;
  expiresAt: string;
}

export interface BetaSwapResult {
  status: 'CONFIRMED';
  swapId: number;
  signature: string | null;
  explorerUrl: string | null;
  usdc: number;
  sol: number;
}

export interface BetaClaimResult {
  status: 'CLAIMED' | 'ALREADY_CLAIMED';
  wallet: string;
  signature?: string;
  explorerUrl?: string;
  grant?: { sol: number; usdc: number };
}

const FALLBACK_LIMITS: BetaLimits = {
  starterSol: 0.25,
  starterUsdc: 25,
  solToUsdcRate: 150,
  swapMinUsdc: 5,
  swapMaxUsdc: 100,
  dailyUsdc: 100,
  dailySol: 0.5,
};

export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * The exact payload the wallet signs. The server rebuilds this string, so the
 * two implementations must stay byte-identical.
 */
export function buildClaimMessage(input: {
  wallet: string;
  code: string;
  issuedAt: number;
}): string {
  return `feras-beta-claim:v1:${input.wallet}:${normalizeInviteCode(input.code)}:${input.issuedAt}`;
}

/**
 * The message a tester signs before a SOL → test-USDC top-up. Amounts travel in
 * base units so the client and server can agree byte-for-byte.
 */
export function buildSwapMessage(input: {
  wallet: string;
  usdcBaseUnits: number | string;
  issuedAt: number;
}): string {
  return `feras-beta-swap:v1:${input.wallet}:${input.usdcBaseUnits}:${input.issuedAt}`;
}

export function toUsdcBaseUnits(usdc: number): string {
  return String(Math.round(usdc * 1_000_000));
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  } catch {
    // Fall through to the generic message.
  }
  return `Beta service request failed (${response.status}).`;
}

export async function getBetaStatus(owner: string): Promise<BetaStatus> {
  const response = await fetch(
    `${CONFIG.marketApiUrl}/v1/beta/status?owner=${encodeURIComponent(owner)}`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) throw new Error(await readError(response));
  const raw = (await response.json()) as Record<string, unknown>;
  const limits = (raw.limits ?? {}) as Record<string, unknown>;
  const tester = raw.tester as Record<string, unknown> | null | undefined;
  const grant = raw.grant as Record<string, unknown> | null | undefined;
  const usage = (raw.usage ?? {}) as Record<string, unknown>;
  const float = (raw.float ?? {}) as Record<string, unknown>;

  return {
    wallet: typeof raw.wallet === 'string' ? raw.wallet : owner,
    enabled: raw.enabled === true,
    disabledReason: typeof raw.disabledReason === 'string' ? raw.disabledReason : null,
    tester: tester
      ? {
          inviteCode: typeof tester.inviteCode === 'string' ? tester.inviteCode : null,
          claimedAt: typeof tester.claimedAt === 'string' ? tester.claimedAt : null,
          blocked: tester.blocked === true,
        }
      : null,
    grant:
      grant && typeof grant.status === 'string'
        ? {
            status: grant.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
            requestedAt:
              typeof grant.requestedAt === 'string' ? grant.requestedAt : new Date(0).toISOString(),
            confirmedAt: typeof grant.confirmedAt === 'string' ? grant.confirmedAt : null,
            explorerUrl: typeof grant.explorerUrl === 'string' ? grant.explorerUrl : null,
          }
        : null,
    canClaim: raw.canClaim === true,
    canTopUp: raw.canTopUp === true,
    limits: {
      starterSol: numberOr(limits.starterSol, FALLBACK_LIMITS.starterSol),
      starterUsdc: numberOr(limits.starterUsdc, FALLBACK_LIMITS.starterUsdc),
      solToUsdcRate: numberOr(limits.solToUsdcRate, FALLBACK_LIMITS.solToUsdcRate),
      swapMinUsdc: numberOr(limits.swapMinUsdc, FALLBACK_LIMITS.swapMinUsdc),
      swapMaxUsdc: numberOr(limits.swapMaxUsdc, FALLBACK_LIMITS.swapMaxUsdc),
      dailyUsdc: numberOr(limits.dailyUsdc, FALLBACK_LIMITS.dailyUsdc),
      dailySol: numberOr(limits.dailySol, FALLBACK_LIMITS.dailySol),
    },
    usage: {
      usdcToday: numberOr(usage.usdcToday, 0),
      solToday: numberOr(usage.solToday, 0),
      usdcRemaining: numberOr(usage.usdcRemaining, FALLBACK_LIMITS.dailyUsdc),
    },
    float: {
      address: typeof float.address === 'string' ? float.address : null,
      usdc: typeof float.usdc === 'number' ? float.usdc : null,
      sol: typeof float.sol === 'number' ? float.sol : null,
    },
  };
}

export async function claimBetaCredits(input: {
  code: string;
  wallet: string;
  issuedAt: number;
  signature: string;
}): Promise<BetaClaimResult> {
  const response = await fetch(`${CONFIG.marketApiUrl}/v1/beta/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: normalizeInviteCode(input.code),
      wallet: input.wallet,
      issuedAt: input.issuedAt,
      signature: input.signature,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as BetaClaimResult;
}

/**
 * Step 1 of a top-up: the server reserves the daily allowance and returns a
 * transaction that is already signed by the float and only needs the tester.
 */
export async function prepareBetaSwap(input: {
  wallet: string;
  usdc: number;
  issuedAt: number;
  signature: string;
}): Promise<BetaSwapQuote> {
  const response = await fetch(`${CONFIG.marketApiUrl}/v1/beta/swap/prepare`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: input.wallet,
      usdc: input.usdc,
      issuedAt: input.issuedAt,
      signature: input.signature,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as BetaSwapQuote;
}

/**
 * Step 2: hand the tester-signed transaction back so the server can verify the
 * instruction set, submit it, and record the result.
 */
export async function submitBetaSwap(input: {
  swapId: number;
  wallet: string;
  transaction: string;
}): Promise<BetaSwapResult> {
  const response = await fetch(`${CONFIG.marketApiUrl}/v1/beta/swap/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as BetaSwapResult;
}
