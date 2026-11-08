import {
  AccountMeta,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';
import { CONFIG } from '../config';
import type {
  MarketOutcome,
  MarketPosition,
  PositionDraft,
  PositionStatus,
} from '../types';

const PLACE_POSITION_DISCRIMINATOR = [218, 31, 90, 75, 101, 209, 5, 253];
const REQUEST_TIMEOUT_MS = 12000;
const outcomeValue: Record<MarketOutcome, number> = { WHITE: 0, DRAW: 1, BLACK: 2 };

interface TransactionAccountPayload {
  address: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface TransactionInstructionPayload {
  programId: string;
  accounts: TransactionAccountPayload[];
  dataBase64: string;
}

interface PositionTransactionResponse {
  correlationId: string;
  instructions: TransactionInstructionPayload[];
}

export interface PositionTransaction {
  correlationId: string;
  instructions: TransactionInstruction[];
}

function decodeBase64(value: string): Uint8Array {
  const decoded = globalThis.atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function readU64LittleEndian(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  }
  return value;
}

function accountMeta(account: TransactionAccountPayload): AccountMeta {
  return {
    pubkey: new PublicKey(account.address),
    isSigner: account.isSigner,
    isWritable: account.isWritable,
  };
}

function validateAndBuildInstructions(
  payload: PositionTransactionResponse,
  draft: PositionDraft,
  owner: string,
): TransactionInstruction[] {
  if (!payload.correlationId || !Array.isArray(payload.instructions) || !payload.instructions.length) {
    throw new Error('The market API returned an invalid transaction request.');
  }

  const expectedAmount = BigInt(Math.round(draft.stakeUsdc * 1_000_000));
  return payload.instructions.map((instruction) => {
    if (instruction.programId !== CONFIG.programId) {
      throw new Error('Rejected transaction: unexpected program address.');
    }
    if (instruction.accounts.length !== 9) {
      throw new Error('Rejected transaction: unexpected market account layout.');
    }

    const data = decodeBase64(instruction.dataBase64);
    const discriminatorMatches = PLACE_POSITION_DISCRIMINATOR.every(
      (byte, index) => data[index] === byte,
    );
    if (!discriminatorMatches || data.length !== 25) {
      throw new Error('Rejected transaction: not a Feras position instruction.');
    }
    if (data[8] !== outcomeValue[draft.outcome]) {
      throw new Error('Rejected transaction: outcome does not match your selection.');
    }
    if (readU64LittleEndian(data, 9) !== expectedAmount) {
      throw new Error('Rejected transaction: amount does not match your selection.');
    }

    const mint = instruction.accounts[5];
    const ownerAccount = instruction.accounts[6];
    if (
      mint.address !== CONFIG.usdcMint ||
      ownerAccount.address !== owner ||
      !ownerAccount.isSigner ||
      !ownerAccount.isWritable
    ) {
      throw new Error('Rejected transaction: wallet or Devnet test-USDC mint mismatch.');
    }

    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),
      keys: instruction.accounts.map(accountMeta),
      data: Buffer.from(data),
    });
  });
}

export async function requestPositionTransaction(
  draft: PositionDraft,
  owner: string,
): Promise<PositionTransaction> {
  const response = await fetch(`${CONFIG.marketApiUrl}/v1/positions/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      cluster: 'devnet',
      matchId: draft.matchId,
      outcome: draft.outcome,
      amountBaseUnits: Math.round(draft.stakeUsdc * 1_000_000).toString(),
      owner,
    }),
  });

  if (!response.ok) {
    let message = `Market API could not create the Devnet transaction (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as PositionTransactionResponse;
  return {
    correlationId: payload.correlationId,
    instructions: validateAndBuildInstructions(payload, draft, owner),
  };
}

function normalizeStatus(value: unknown): PositionStatus {
  return value === 'WON' || value === 'LOST' || value === 'CANCELLED' ? value : 'ACTIVE';
}

function normalizeOutcome(value: unknown): MarketOutcome {
  return value === 'DRAW' || value === 'BLACK' ? value : 'WHITE';
}

function normalizePosition(value: unknown): MarketPosition | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string') return null;
  const receipt = (raw.receipt ?? {}) as Record<string, unknown>;
  return {
    id: raw.id,
    matchId: typeof raw.matchId === 'string' ? raw.matchId : '',
    matchTitle: typeof raw.matchTitle === 'string' ? raw.matchTitle : 'Feras market',
    selectedAgentId: typeof raw.selectedAgentId === 'string' ? raw.selectedAgentId : '',
    selectedAgentName:
      typeof raw.selectedAgentName === 'string' ? raw.selectedAgentName : 'Agent',
    outcome: normalizeOutcome(raw.outcome),
    stakeUsdc: typeof raw.stakeUsdc === 'number' ? raw.stakeUsdc : 0,
    estimatedMultiplier:
      typeof raw.estimatedMultiplier === 'number' ? raw.estimatedMultiplier : 0,
    estimatedReturnUsdc:
      typeof raw.estimatedReturnUsdc === 'number' ? raw.estimatedReturnUsdc : 0,
    status: normalizeStatus(raw.status),
    placedAt: typeof raw.placedAt === 'string' ? raw.placedAt : new Date(0).toISOString(),
    settledAt: typeof raw.settledAt === 'string' ? raw.settledAt : undefined,
    receipt: {
      signature: typeof receipt.signature === 'string' ? receipt.signature : null,
      explorerUrl: typeof receipt.explorerUrl === 'string' ? receipt.explorerUrl : null,
      cluster: 'devnet',
    },
  };
}

export async function getPositions(owner: string): Promise<MarketPosition[]> {
  const response = await fetch(
    `${CONFIG.marketApiUrl}/v1/positions?owner=${encodeURIComponent(owner)}`,
    { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) {
    throw new Error(`Market API could not load positions (${response.status}).`);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('Market API returned an invalid position list.');
  }
  return payload
    .map(normalizePosition)
    .filter((position): position is MarketPosition => position !== null);
}
