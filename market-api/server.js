#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { Connection, PublicKey } = require('@coral-xyz/anchor').web3;
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} = require('@solana/spl-token');

const MARKET_DISCRIMINATOR = Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]);
const PLACE_POSITION_DISCRIMINATOR = Buffer.from([218, 31, 90, 75, 101, 209, 5, 253]);
const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
const OUTCOME = { WHITE: 0, DRAW: 1, BLACK: 2 };
const PORT = Number(process.env.PORT || 8787);
const RPC_URL = process.env.FERAS_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const REGISTRY_PATH = process.env.FERAS_MARKET_REGISTRY_PATH || 'config/devnet-markets.json';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function asPublicKey(value, label) {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a valid Solana address`);
  }
}

function readRegistry() {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    throw new Error(`Cannot read market registry at ${REGISTRY_PATH}`);
  }
  if (!Array.isArray(parsed)) throw new Error('Market registry must be an array');
  return parsed;
}

function parseAmount(value) {
  if (!/^[1-9]\d*$/.test(value || '')) {
    throw new Error('amountBaseUnits must be a positive integer string');
  }
  return BigInt(value);
}

function u64Bytes(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function matchForId(registry, id) {
  const match = registry.find((item) => item.id === id);
  if (!match) throw new Error('Unknown canonical Devnet match');
  if (!match.marketAddress || !match.vaultAddress) {
    throw new Error('Market registry entry is missing its on-chain market or vault address');
  }
  return match;
}

async function assertMarketOnChain({ connection, programId, configPda, match }) {
  const market = asPublicKey(match.marketAddress, 'marketAddress');
  const account = await connection.getAccountInfo(market, 'confirmed');
  if (!account || !account.owner.equals(programId)) {
    throw new Error('Registered market is not owned by the configured Feras program');
  }
  if (!account.data.subarray(0, 8).equals(MARKET_DISCRIMINATOR) || account.data.length < 136) {
    throw new Error('Registered market does not match the expected Feras market layout');
  }
  const config = new PublicKey(account.data.subarray(8, 40));
  const vault = new PublicKey(account.data.subarray(104, 136));
  if (!config.equals(configPda) || !vault.equals(asPublicKey(match.vaultAddress, 'vaultAddress'))) {
    throw new Error('Registered market configuration or vault does not match on-chain state');
  }
  return market;
}

async function buildPositionInstruction(body) {
  if (body.cluster !== 'devnet') throw new Error('Only devnet is supported');
  if (!Object.hasOwn(OUTCOME, body.outcome)) throw new Error('Invalid market outcome');

  const programId = asPublicKey(required('FERAS_PROGRAM_ID'), 'FERAS_PROGRAM_ID');
  const mint = asPublicKey(required('FERAS_DEVNET_USDC_MINT'), 'FERAS_DEVNET_USDC_MINT');
  const owner = asPublicKey(body.owner, 'owner');
  const amount = parseAmount(body.amountBaseUnits);
  const registry = readRegistry();
  const match = matchForId(registry, body.matchId);
  const connection = new Connection(RPC_URL, 'confirmed');
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const market = await assertMarketOnChain({ connection, programId, configPda, match });
  const ownerToken = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const ownerTokenBalance = await connection.getTokenAccountBalance(ownerToken, 'confirmed');
  if (BigInt(ownerTokenBalance.value.amount) < amount) {
    throw new Error('Connected wallet does not have enough Devnet USDC');
  }

  const clientNonce = crypto.randomBytes(8).readBigUInt64LE();
  const [position] = PublicKey.findProgramAddressSync(
    [Buffer.from('position'), market.toBuffer(), owner.toBuffer(), u64Bytes(clientNonce)],
    programId,
  );
  const data = Buffer.concat([
    PLACE_POSITION_DISCRIMINATOR,
    Buffer.from([OUTCOME[body.outcome]]),
    u64Bytes(amount),
    u64Bytes(clientNonce),
  ]);

  return {
    correlationId: crypto.randomUUID(),
    instructions: [
      {
        programId: programId.toBase58(),
        accounts: [
          { address: configPda.toBase58(), isSigner: false, isWritable: false },
          { address: market.toBase58(), isSigner: false, isWritable: true },
          { address: position.toBase58(), isSigner: false, isWritable: true },
          { address: ownerToken.toBase58(), isSigner: false, isWritable: true },
          { address: match.vaultAddress, isSigner: false, isWritable: true },
          { address: mint.toBase58(), isSigner: false, isWritable: false },
          { address: owner.toBase58(), isSigner: true, isWritable: true },
          { address: TOKEN_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
          { address: SYSTEM_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
        ],
        dataBase64: data.toString('base64'),
      },
    ],
  };
}

async function loadOwnerPositions(ownerAddress, registry) {
  const programId = asPublicKey(required('FERAS_PROGRAM_ID'), 'FERAS_PROGRAM_ID');
  const owner = asPublicKey(ownerAddress, 'owner');
  const connection = new Connection(RPC_URL, 'confirmed');
  const registryByMarket = new Map(registry.map((match) => [match.marketAddress, match]));
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: 'confirmed',
    filters: [{ memcmp: { offset: 40, bytes: owner.toBase58() } }],
  });

  return Promise.all(
    accounts.flatMap(async ({ pubkey, account }) => {
      if (!account.data.subarray(0, 8).equals(Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]))) {
        return [];
      }
      if (account.data.length < 81) return [];
      const matchAddress = new PublicKey(account.data.subarray(8, 40)).toBase58();
      const match = registryByMarket.get(matchAddress);
      if (!match) return [];
      const outcomeIndex = account.data[72];
      const outcome = ['WHITE', 'DRAW', 'BLACK'][outcomeIndex];
      if (!outcome) return [];
      const amountBaseUnits = account.data.readBigUInt64LE(73);
      const marketAccount = await connection.getAccountInfo(new PublicKey(matchAddress), 'confirmed');
      if (!marketAccount || !marketAccount.owner.equals(programId) || marketAccount.data.length < 147) {
        return [];
      }
      const marketStatus = marketAccount.data[144];
      const resolvedOutcome = marketAccount.data[145] === 1
        ? ['WHITE', 'DRAW', 'BLACK'][marketAccount.data[146]]
        : null;
      const status = marketStatus === 3
        ? 'CANCELLED'
        : (marketStatus === 2 || marketStatus === 4) && resolvedOutcome
          ? (outcome === resolvedOutcome ? 'WON' : 'LOST')
          : 'ACTIVE';
      const latestSignature = await connection.getSignaturesForAddress(pubkey, { limit: 1 });
      const signature = latestSignature[0];
      const multiplierKey = `${outcome.toLowerCase()}Multiplier`;
      const estimatedMultiplier = Number(match.marketEstimates?.[multiplierKey] || 0);
      return [{
        id: pubkey.toBase58(),
        matchId: match.id,
        matchTitle: match.title,
        selectedAgentId: outcome === 'WHITE' ? match.whiteAgent?.id || '' : outcome === 'BLACK' ? match.blackAgent?.id || '' : '',
        selectedAgentName: outcome === 'WHITE' ? match.whiteAgent?.name || 'White' : outcome === 'BLACK' ? match.blackAgent?.name || 'Black' : 'Draw',
        outcome,
        stakeUsdc: Number(amountBaseUnits) / 1_000_000,
        estimatedMultiplier,
        estimatedReturnUsdc: Number((Number(amountBaseUnits) / 1_000_000) * estimatedMultiplier),
        status,
        placedAt: signature?.blockTime ? new Date(signature.blockTime * 1000).toISOString() : new Date(0).toISOString(),
        receipt: {
          id: pubkey.toBase58(),
          status: 'CONFIRMED',
          cluster: 'devnet',
          signature: signature?.signature || null,
          explorerUrl: signature ? `https://explorer.solana.com/tx/${signature.signature}?cluster=devnet` : null,
          submittedAt: signature?.blockTime ? new Date(signature.blockTime * 1000).toISOString() : new Date(0).toISOString(),
        },
      }];
    }),
  ).then((entries) => entries.flat());
}

async function handle(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const registry = readRegistry();
    if (request.method === 'GET' && url.pathname === '/v1/matches') {
      const status = url.searchParams.get('status');
      return json(response, 200, status ? registry.filter((match) => match.status === status) : registry);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/v1/matches/')) {
      const match = matchForId(registry, decodeURIComponent(url.pathname.slice('/v1/matches/'.length)));
      return json(response, 200, match);
    }
    if (request.method === 'GET' && url.pathname === '/v1/positions') {
      const owner = url.searchParams.get('owner');
      if (!owner) throw new Error('owner query parameter is required');
      return json(response, 200, await loadOwnerPositions(owner, registry));
    }
    if (request.method === 'POST' && url.pathname === '/v1/positions/transaction') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const instruction = await buildPositionInstruction(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      return json(response, 200, instruction);
    }
    return json(response, 404, { error: 'Not found' });
  } catch (error) {
    return json(response, 422, { error: error instanceof Error ? error.message : 'Invalid request' });
  }
}

http.createServer((request, response) => {
  void handle(request, response);
}).listen(PORT, () => {
  process.stdout.write(`Feras Devnet market API listening on :${PORT}\n`);
});
