import { MarketPosition } from '@/types/position';
import { walletService } from '@/services/wallet';
import { MarketOutcome } from '@/services/wallet/IWalletService';
import {
  FERAS_MARKET_API_URL,
  FERAS_MARKET_PROGRAM_ID,
  USDC_ASSET,
} from '@/services/solana/config';
import { AccountRole, address, type Instruction } from '@solana/kit';

let inMemoryPositions: MarketPosition[] = [];

export async function getPositionHistory(): Promise<MarketPosition[]> {
  const wallet = await walletService.getState();
  if (!wallet.isConnected || !wallet.address || !FERAS_MARKET_API_URL) {
    return [];
  }

  const response = await fetch(
    `${FERAS_MARKET_API_URL}/v1/positions?owner=${encodeURIComponent(wallet.address)}`,
  );
  if (!response.ok) {
    throw new Error(`Market API could not load Devnet positions (${response.status}).`);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('Market API returned an invalid Devnet position history.');
  }
  inMemoryPositions = payload as MarketPosition[];
  return [...inMemoryPositions];
}

export interface PlacePositionParams {
  matchId: string;
  matchTitle: string;
  selectedAgentId: string;
  selectedAgentName: string;
  outcome: MarketOutcome;
  stakeUsdc: number;
  estimatedMultiplier: number;
}

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

const PLACE_POSITION_DISCRIMINATOR = [218, 31, 90, 75, 101, 209, 5, 253];
const outcomeValue: Record<MarketOutcome, number> = { WHITE: 0, DRAW: 1, BLACK: 2 };

function decodeBase64(value: string): Uint8Array {
  if (typeof globalThis.atob !== 'function') {
    throw new Error('This device cannot decode the market transaction payload.');
  }
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

function accountRole(account: TransactionAccountPayload): AccountRole {
  if (account.isSigner && account.isWritable) return AccountRole.WRITABLE_SIGNER;
  if (account.isSigner) return AccountRole.READONLY_SIGNER;
  return account.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}

function validateAndBuildInstructions(
  payload: PositionTransactionResponse,
  params: PlacePositionParams,
  owner: string,
): Instruction[] {
  if (!USDC_ASSET.mintAddress) {
    throw new Error('The Devnet test-USDC mint is not configured.');
  }
  if (!payload.correlationId || !Array.isArray(payload.instructions) || !payload.instructions.length) {
    throw new Error('The market API returned an invalid transaction request.');
  }

  const expectedAmount = BigInt(Math.round(params.stakeUsdc * 1_000_000));
  return payload.instructions.map((instructionPayload) => {
    if (instructionPayload.programId !== FERAS_MARKET_PROGRAM_ID) {
      throw new Error('Rejected transaction: unexpected program address.');
    }
    if (instructionPayload.accounts.length !== 9) {
      throw new Error('Rejected transaction: unexpected market account layout.');
    }

    const data = decodeBase64(instructionPayload.dataBase64);
    const hasExpectedDiscriminator = PLACE_POSITION_DISCRIMINATOR.every(
      (byte, index) => data[index] === byte,
    );
    if (!hasExpectedDiscriminator || data.length !== 25) {
      throw new Error('Rejected transaction: not a Feras position instruction.');
    }
    if (data[8] !== outcomeValue[params.outcome]) {
      throw new Error('Rejected transaction: outcome does not match your selection.');
    }
    if (readU64LittleEndian(data, 9) !== expectedAmount) {
      throw new Error('Rejected transaction: amount does not match your selection.');
    }

    const mint = instructionPayload.accounts[5];
    const ownerAccount = instructionPayload.accounts[6];
    if (
      mint.address !== USDC_ASSET.mintAddress ||
      ownerAccount.address !== owner ||
      !ownerAccount.isSigner ||
      !ownerAccount.isWritable
    ) {
      throw new Error('Rejected transaction: wallet or Devnet test-USDC mint mismatch.');
    }

    return {
      programAddress: address(instructionPayload.programId),
      accounts: instructionPayload.accounts.map((account) => ({
        address: address(account.address),
        role: accountRole(account),
      })),
      data,
    };
  });
}

async function getPositionTransaction(
  params: PlacePositionParams,
  owner: string,
): Promise<{ correlationId: string; instructions: Instruction[] }> {
  if (!FERAS_MARKET_API_URL) {
    throw new Error('Devnet market API is not configured. Real positions are unavailable until it is deployed.');
  }

  const response = await fetch(`${FERAS_MARKET_API_URL}/v1/positions/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cluster: 'devnet',
      matchId: params.matchId,
      outcome: params.outcome,
      amountBaseUnits: Math.round(params.stakeUsdc * 1_000_000).toString(),
      owner,
    }),
  });
  if (!response.ok) {
    throw new Error(`Market API could not create the Devnet transaction (${response.status}).`);
  }

  const payload = (await response.json()) as PositionTransactionResponse;
  return {
    correlationId: payload.correlationId,
    instructions: validateAndBuildInstructions(payload, params, owner),
  };
}

export async function placePosition(
  params: PlacePositionParams,
): Promise<MarketPosition> {
  const wallet = await walletService.getState();
  if (!wallet.isConnected || !wallet.address) {
    throw new Error('Connect a Devnet wallet before creating a prediction.');
  }
  const transaction = await getPositionTransaction(params, wallet.address);
  const receipt = await walletService.placeMarketPosition({
    matchId: params.matchId,
    amountUsdc: params.stakeUsdc,
    outcome: params.outcome,
    estimatedMultiplier: params.estimatedMultiplier,
    instructions: transaction.instructions,
    correlationId: transaction.correlationId,
  });

  const newPosition: MarketPosition = {
    id: `position-${Date.now()}`,
    matchId: params.matchId,
    matchTitle: params.matchTitle,
    selectedAgentId: params.selectedAgentId,
    selectedAgentName: params.selectedAgentName,
    outcome: params.outcome,
    stakeUsdc: params.stakeUsdc,
    estimatedMultiplier: params.estimatedMultiplier,
    estimatedReturnUsdc: Number(
      (params.stakeUsdc * params.estimatedMultiplier).toFixed(2),
    ),
    status: 'ACTIVE',
    placedAt: new Date().toISOString(),
    receipt,
  };

  inMemoryPositions = [newPosition, ...inMemoryPositions];
  return newPosition;
}
