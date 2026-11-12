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
const POSITION_DISCRIMINATOR = Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]);
const CLAIM_DISCRIMINATOR = Buffer.from([62, 198, 214, 193, 213, 159, 108, 210]);
const CLAIM_REFUND_DISCRIMINATOR = Buffer.from([15, 16, 30, 161, 255, 228, 97, 60]);
const PORT = Number(process.env.PORT || 8787);
const RPC_URL = process.env.FERAS_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const REGISTRY_PATH = process.env.FERAS_MARKET_REGISTRY_PATH || 'config/devnet-markets.json';
const ADMIN_TOKEN = (process.env.FERAS_ADMIN_TOKEN || '').trim();
let matchReadApi = null;
let betaService = null;

if (process.env.FERAS_DATABASE_URL) {
  const { MatchRepository } = require('../backend/src/repository');
  const { createReadApi } = require('../backend/src/read-api');
  matchReadApi = createReadApi(new MatchRepository(process.env.FERAS_DATABASE_URL));

  // The beta service is instantiated even without a treasury key so that
  // /v1/beta/status can explain that grants are disabled instead of 404ing.
  try {
    const { createBetaService } = require('../backend/src/beta');
    betaService = createBetaService({
      databaseUrl: process.env.FERAS_DATABASE_URL,
      rpcUrl: RPC_URL,
      mint: process.env.FERAS_DEVNET_USDC_MINT,
      treasurySecret: process.env.FERAS_BETA_TREASURY_SECRET_KEY,
      expectedTreasury: process.env.FERAS_BETA_TREASURY_ADDRESS,
    });
    if (!betaService.enabled) {
      process.stderr.write(`Beta credits disabled: ${betaService.disabledReason}\n`);
    }
  } catch (error) {
    process.stderr.write(`Beta credits unavailable: ${error instanceof Error ? error.message : error}\n`);
  }
}

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
    parsed = process.env.FERAS_MARKET_REGISTRY_JSON
      ? JSON.parse(process.env.FERAS_MARKET_REGISTRY_JSON)
      : JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    throw new Error('Cannot read the Devnet market registry');
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

function matchPathId(pathname, suffix) {
  return decodeURIComponent(pathname.slice('/v1/matches/'.length, -suffix.length));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function adminGuard(url) {
  if (!ADMIN_TOKEN) {
    throw Object.assign(new Error('Admin API is disabled: FERAS_ADMIN_TOKEN is not configured'), { status: 503 });
  }
  const supplied = Buffer.from(url.searchParams.get('token') || '');
  const expected = Buffer.from(ADMIN_TOKEN);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 });
  }
}

function readU16(data, offset) {
  return data.length >= offset + 2 ? data.readUInt16LE(offset) : 0;
}

function readU64Number(data, offset) {
  return data.length >= offset + 8 ? Number(data.readBigUInt64LE(offset)) : 0;
}

/**
 * On-chain pool enrichment.
 *
 * The database only stores the match transcript, so odds and pool volume must
 * come from the market accounts. All markets are read in one batched RPC call
 * and the fee is read once per minute.
 */
const feeCache = { value: 200, at: 0 };

async function readFeeBps(connection, programId, configPda) {
  if (Date.now() - feeCache.at < 60_000) return feeCache.value;
  try {
    const account = await connection.getAccountInfo(configPda, 'confirmed');
    if (account && account.owner.equals(programId) && account.data.length >= 202) {
      feeCache.value = readU16(account.data, 200);
      feeCache.at = Date.now();
    }
  } catch {
    // Keep the last known fee; a stale 2% is better than hiding every market.
  }
  return feeCache.value;
}

function marketStats(data, feeBps) {
  if (!data || data.length < 179) return null;
  const status = data[144];
  const pools = [
    readU64Number(data, 147),
    readU64Number(data, 155),
    readU64Number(data, 163),
  ];
  const totalPool = readU64Number(data, 171);
  const fee = Math.floor((totalPool * feeBps) / 10_000);
  const netPool = totalPool - fee;
  const multiplier = (pool) => (totalPool > 0 && pool > 0 ? netPool / pool : 0);
  return {
    status,
    poolVolumeUsdc: totalPool / 1_000_000,
    marketEstimates: {
      whiteMultiplier: multiplier(pools[0]),
      drawMultiplier: multiplier(pools[1]),
      blackMultiplier: multiplier(pools[2]),
    },
  };
}

async function enrichMarkets(matches) {
  const list = Array.isArray(matches) ? matches : [matches];
  const addresses = [...new Set(list.map((match) => match?.marketAddress).filter(Boolean))];
  if (addresses.length === 0) return matches;

  try {
    const programId = asPublicKey(required('FERAS_PROGRAM_ID'), 'FERAS_PROGRAM_ID');
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
    const connection = new Connection(RPC_URL, 'confirmed');
    const [feeBps, accounts] = await Promise.all([
      readFeeBps(connection, programId, configPda),
      connection.getMultipleAccountsInfo(addresses.map((address) => new PublicKey(address)), 'confirmed'),
    ]);
    const byAddress = new Map();
    addresses.forEach((address, index) => {
      const stats = marketStats(accounts[index]?.data, feeBps);
      if (stats) byAddress.set(address, stats);
    });
    for (const match of list) {
      const stats = match?.marketAddress ? byAddress.get(match.marketAddress) : null;
      if (!stats) continue;
      match.poolVolumeUsdc = stats.poolVolumeUsdc;
      match.marketEstimates = stats.marketEstimates;
      match.marketStatus = ['OPEN', 'LOCKED', 'SETTLED', 'CANCELLED', 'CLOSED'][stats.status] || 'UNKNOWN';
    }
  } catch (error) {
    process.stderr.write(`Pool enrichment failed: ${error instanceof Error ? error.message : error}\n`);
  }
  return matches;
}

async function streamEvents(request, response, api, matchId, after) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  response.write('retry: 2000\n\n');
  let lastSequence = after;
  let closed = false;
  let polling = false;
  const send = async () => {
    if (closed || polling) return;
    polling = true;
    try {
      const events = await api.events(matchId, lastSequence);
      for (const event of events) {
        lastSequence = Number(event.sequence);
        response.write(`id: ${lastSequence}\nevent: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      response.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
    } finally { polling = false; }
  };
  await send();
  const heartbeat = setInterval(() => { if (!closed) response.write(': keep-alive\n\n'); }, 15_000);
  const poll = setInterval(() => { void send(); }, 1_000);
  request.once('close', () => { closed = true; clearInterval(heartbeat); clearInterval(poll); response.end(); });
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

  const lockTime = Number(account.data.readBigInt64LE(136));
  const status = account.data[144];
  if (status !== 0) {
    throw new Error('Registered market is not open for new positions');
  }
  if (!Number.isSafeInteger(lockTime) || lockTime <= Math.floor(Date.now() / 1000)) {
    throw new Error('Registered market has passed its lock time');
  }

  return { market, lockTime };
}

async function buildPositionInstruction(body) {
  if (body.cluster !== 'devnet') throw new Error('Only devnet is supported');
  if (!Object.hasOwn(OUTCOME, body.outcome)) throw new Error('Invalid market outcome');

  const programId = asPublicKey(required('FERAS_PROGRAM_ID'), 'FERAS_PROGRAM_ID');
  const mint = asPublicKey(required('FERAS_DEVNET_USDC_MINT'), 'FERAS_DEVNET_USDC_MINT');
  const owner = asPublicKey(body.owner, 'owner');
  const amount = parseAmount(body.amountBaseUnits);
  let match = null;
  if (matchReadApi) {
    match = await matchReadApi.get(body.matchId);
  }
  if (!match) {
    const registry = readRegistry();
    match = matchForId(registry, body.matchId);
  }
  if (!match || !match.marketAddress || !match.vaultAddress) {
    throw new Error('Market entry is missing its on-chain market or vault address');
  }
  const connection = new Connection(RPC_URL, 'confirmed');
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const { market } = await assertMarketOnChain({ connection, programId, configPda, match });
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
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const registryByMarket = new Map(registry.map((match) => [match.marketAddress, match]));
  if (matchReadApi) {
    try {
      const dbMatches = await matchReadApi.list(undefined, { limit: 500 });
      for (const m of dbMatches) {
        if (m.marketAddress) registryByMarket.set(m.marketAddress, m);
      }
    } catch {}
  }
  const accounts = await connection.getProgramAccounts(programId, {
    commitment: 'confirmed',
    filters: [{ memcmp: { offset: 40, bytes: owner.toBase58() } }],
  });
  const positionAccounts = accounts.filter(
    ({ account }) =>
      account.data.length >= 91 &&
      account.data.subarray(0, 8).equals(POSITION_DISCRIMINATOR),
  );
  const marketAddresses = [...new Set(
    positionAccounts.map(({ account }) => new PublicKey(account.data.subarray(8, 40)).toBase58()),
  )];
  const [feeBps, marketAccounts] = await Promise.all([
    readFeeBps(connection, programId, configPda),
    marketAddresses.length
      ? connection.getMultipleAccountsInfo(marketAddresses.map((address) => new PublicKey(address)), 'confirmed')
      : Promise.resolve([]),
  ]);
  const marketByAddress = new Map();
  marketAddresses.forEach((address, index) => {
    const account = marketAccounts[index];
    if (account && account.owner.equals(programId) && account.data.length >= 179) {
      marketByAddress.set(address, account.data);
    }
  });

  return Promise.all(
    positionAccounts.map(async ({ pubkey, account }) => {
      const matchAddress = new PublicKey(account.data.subarray(8, 40)).toBase58();
      const match = registryByMarket.get(matchAddress);
      if (!match) return null;
      const outcomeIndex = account.data[72];
      const outcome = ['WHITE', 'DRAW', 'BLACK'][outcomeIndex];
      if (!outcome) return null;
      const amountBaseUnits = account.data.readBigUInt64LE(73);
      const claimed = account.data[89] === 1;
      const refunded = account.data[90] === 1;
      const marketData = marketByAddress.get(matchAddress);
      if (!marketData) return null;
      const stats = marketStats(marketData, feeBps);
      const marketStatus = marketData[144];
      const resolvedOutcome = marketData[145] === 1
        ? ['WHITE', 'DRAW', 'BLACK'][marketData[146]]
        : null;
      const claimDeadline = Number(marketData.readBigInt64LE(235));
      const nowSeconds = Math.floor(Date.now() / 1000);
      const payoutBaseUnits = (() => {
        if (marketStatus !== 2 || !resolvedOutcome || outcome !== resolvedOutcome) return 0n;
        const pools = [147, 155, 163].map((offset) => BigInt(readU64Number(marketData, offset)));
        const totalPool = BigInt(readU64Number(marketData, 171));
        const fee = BigInt(Math.floor(Number(totalPool) * feeBps / 10_000));
        const netPool = totalPool - fee;
        const winningPool = pools[outcomeIndex];
        if (winningPool === 0n) return 0n;
        return (amountBaseUnits * netPool) / winningPool;
      })();
      const status = refunded
        ? 'REFUNDED'
        : claimed
          ? 'CLAIMED'
          : marketStatus === 3
            ? 'CANCELLED'
            : (marketStatus === 2 || marketStatus === 4) && resolvedOutcome
              ? (outcome === resolvedOutcome ? 'WON' : 'LOST')
              : 'ACTIVE';
      const canClaim =
        !claimed && !refunded && marketStatus === 2 &&
        resolvedOutcome === outcome && nowSeconds <= claimDeadline;
      const canRefund =
        !claimed && !refunded && marketStatus === 3 && nowSeconds <= claimDeadline;
      const latestSignature = await connection.getSignaturesForAddress(pubkey, { limit: 1 });
      const signature = latestSignature[0];
      const multiplierKey = `${outcome.toLowerCase()}Multiplier`;
      const estimatedMultiplier = Number(stats?.marketEstimates?.[multiplierKey] || 0);
      return {
        id: pubkey.toBase58(),
        matchId: match.id,
        matchTitle: match.title,
        selectedAgentId: outcome === 'WHITE' ? match.whiteAgent?.id || '' : outcome === 'BLACK' ? match.blackAgent?.id || '' : '',
        selectedAgentName: outcome === 'WHITE' ? match.whiteAgent?.name || 'White' : outcome === 'BLACK' ? match.blackAgent?.name || 'Black' : 'Draw',
        outcome,
        stakeUsdc: Number(amountBaseUnits) / 1_000_000,
        estimatedMultiplier,
        estimatedReturnUsdc: Number(payoutBaseUnits) / 1_000_000,
        payoutUsdc: Number(payoutBaseUnits) / 1_000_000,
        status,
        claimed,
        refunded,
        canClaim,
        canRefund,
        claimDeadline: new Date(claimDeadline * 1000).toISOString(),
        placedAt: signature?.blockTime ? new Date(signature.blockTime * 1000).toISOString() : new Date(0).toISOString(),
        receipt: {
          id: pubkey.toBase58(),
          status: 'CONFIRMED',
          cluster: 'devnet',
          signature: signature?.signature || null,
          explorerUrl: signature ? `https://explorer.solana.com/tx/${signature.signature}?cluster=devnet` : null,
          submittedAt: signature?.blockTime ? new Date(signature.blockTime * 1000).toISOString() : new Date(0).toISOString(),
        },
      };
    }),
  ).then((entries) => entries.filter(Boolean));
}

/**
 * Build a claim or refund instruction for a position the caller owns. The
 * program does not require the owner to sign (payout is pinned to their token
 * account), but the connected wallet still pays the fee and signs the tx.
 */
async function buildSettlementInstruction(body) {
  const programId = asPublicKey(required('FERAS_PROGRAM_ID'), 'FERAS_PROGRAM_ID');
  const mint = asPublicKey(required('FERAS_DEVNET_USDC_MINT'), 'FERAS_DEVNET_USDC_MINT');
  const owner = asPublicKey(body.owner, 'owner');
  const positionAddress = asPublicKey(body.position, 'position');
  const kind = body.kind === 'refund' ? 'refund' : 'claim';
  const connection = new Connection(RPC_URL, 'confirmed');
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);

  const positionAccount = await connection.getAccountInfo(positionAddress, 'confirmed');
  if (!positionAccount || !positionAccount.owner.equals(programId) || positionAccount.data.length < 91) {
    throw new Error('Position account was not found on Devnet');
  }
  if (!positionAccount.data.subarray(0, 8).equals(POSITION_DISCRIMINATOR)) {
    throw new Error('Account is not a Feras position');
  }
  const positionOwner = new PublicKey(positionAccount.data.subarray(40, 72));
  if (!positionOwner.equals(owner)) throw new Error('This position belongs to a different wallet');
  const claimed = positionAccount.data[89] === 1;
  const refunded = positionAccount.data[90] === 1;
  if (claimed) throw new Error('This position has already been claimed');
  if (refunded) throw new Error('This position has already been refunded');

  const marketAddress = new PublicKey(positionAccount.data.subarray(8, 40));
  const marketAccount = await connection.getAccountInfo(marketAddress, 'confirmed');
  if (!marketAccount || !marketAccount.owner.equals(programId) || marketAccount.data.length < 179) {
    throw new Error('Market account was not found on Devnet');
  }
  const status = marketAccount.data[144];
  if (kind === 'claim' && status !== 2) throw new Error('This market has not been settled yet');
  if (kind === 'refund' && status !== 3) throw new Error('This market was not cancelled');

  const vault = new PublicKey(marketAccount.data.subarray(104, 136));
  const ownerToken = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const discriminator = kind === 'refund' ? CLAIM_REFUND_DISCRIMINATOR : CLAIM_DISCRIMINATOR;
  const accounts = [
    { address: configPda.toBase58(), isSigner: false, isWritable: false },
    { address: marketAddress.toBase58(), isSigner: false, isWritable: true },
    { address: positionAddress.toBase58(), isSigner: false, isWritable: true },
    { address: ownerToken.toBase58(), isSigner: false, isWritable: true },
    { address: vault.toBase58(), isSigner: false, isWritable: true },
    { address: mint.toBase58(), isSigner: false, isWritable: false },
    { address: owner.toBase58(), isSigner: true, isWritable: false },
    { address: TOKEN_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
  ];

  return {
    correlationId: crypto.randomUUID(),
    kind,
    instructions: [
      {
        programId: programId.toBase58(),
        accounts,
        dataBase64: discriminator.toString('base64'),
      },
    ],
  };
}

const CORS_ORIGINS = (process.env.FERAS_CORS_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (!origin) return;
  if (CORS_ORIGINS.includes('*')) {
    response.setHeader('Access-Control-Allow-Origin', '*');
  } else if (CORS_ORIGINS.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  } else {
    return;
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Max-Age', '86400');
}

async function handle(request, response) {
  try {
    applyCors(request, response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return undefined;
    }
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return json(response, 200, { service: 'feras-market-api', cluster: 'devnet', status: 'ok', matchSource: matchReadApi ? 'postgres' : 'registry' });
    }
    if (request.method === 'GET' && url.pathname === '/readyz') {
      if (!matchReadApi) return json(response, 503, { status: 'not-ready', reason: 'PostgreSQL match source is not configured' });
      try {
        return json(response, 200, await matchReadApi.ready());
      } catch {
        return json(response, 503, { status: 'not-ready', reason: 'PostgreSQL is unavailable' });
      }
    }
    if (matchReadApi && request.method === 'GET' && url.pathname === '/v1/matches') {
      const limit = Number(url.searchParams.get('limit') || 200);
      const matches = await matchReadApi.list(url.searchParams.get('status'), {
        limit: Number.isFinite(limit) ? limit : 200,
      });
      return json(response, 200, await enrichMarkets(matches));
    }
    if (matchReadApi && request.method === 'GET' && url.pathname === '/v1/matchmaker/preview') {
      const existing = await matchReadApi.list();
      const { nextGrandPrixNumber, pairingForIndex } = require('../backend/src/pairing');
      const { loadRosterFromPool } = require('../backend/src/profiles');
      const roster = await loadRosterFromPool(matchReadApi.repository.pool);
      const nextNum = Math.max(
        nextGrandPrixNumber(existing),
        (await matchReadApi.repository.maxGrandPrixNumber()) + 1,
      );
      const rotation = pairingForIndex(roster, nextNum - 1);
      return json(response, 200, {
        suggestedId: `gp-${String(nextNum).padStart(3, '0')}`,
        suggestedTitle: `Grand Prix Round ${nextNum}`,
        nextRound: nextNum,
        suggestedWhite: rotation.white.name,
        suggestedBlack: rotation.black.name,
        whiteAgentId: rotation.white.id,
        blackAgentId: rotation.black.id,
        swapColors: rotation.swapColors,
        scheduleIndex: rotation.scheduleIndex,
        roster: roster.map((profile) => ({ id: profile.id, name: profile.name, skillLevel: profile.engine?.skillLevel ?? null })),
      });
    }
    if (matchReadApi && request.method === 'POST' && url.pathname === '/v1/matchmaker/pair') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const { autoPairMatch } = require('../backend/src/matchmaker');
      const paired = await autoPairMatch({
        databaseUrl: process.env.FERAS_DATABASE_URL,
        matchId: body.matchId,
        title: body.title,
        category: body.category || 'BENCHMARK',
        countdownMinutes: Number(body.countdownMinutes || 15),
        whiteAgentId: body.whiteAgentId,
        blackAgentId: body.blackAgentId,
        swapColors: body.swapColors === true,
        baseTimeMs: Number(body.baseTimeMs || 180_000),
        incrementMs: Number(body.incrementMs || 2_000),
      });
      return json(response, 201, paired);
    }
    if (matchReadApi && request.method === 'GET' && url.pathname.endsWith('/replay')) {
      const id = matchPathId(url.pathname, '/replay');
      const replay = await matchReadApi.replay(id);
      return replay ? json(response, 200, replay) : json(response, 404, { error: 'Match not found' });
    }
    if (matchReadApi && request.method === 'GET' && url.pathname.endsWith('/events')) {
      const id = matchPathId(url.pathname, '/events');
      const after = Number(url.searchParams.get('after') || 0);
      if (!Number.isInteger(after) || after < 0) throw new Error('after must be a non-negative integer');
      return json(response, 200, await matchReadApi.events(id, after));
    }
    if (matchReadApi && request.method === 'GET' && url.pathname.endsWith('/events/stream')) {
      const id = matchPathId(url.pathname, '/events/stream');
      const after = Number(url.searchParams.get('after') || request.headers['last-event-id'] || 0);
      if (!Number.isInteger(after) || after < 0) throw new Error('after must be a non-negative integer');
      return streamEvents(request, response, matchReadApi, id, after);
    }
    if (matchReadApi && request.method === 'GET' && url.pathname.endsWith('/transcript')) {
      const transcript = await matchReadApi.transcript(matchPathId(url.pathname, '/transcript'));
      return transcript ? json(response, 200, transcript) : json(response, 404, { error: 'Match not found' });
    }
    if (matchReadApi && request.method === 'GET' && url.pathname.startsWith('/v1/matches/')) {
      const id = decodeURIComponent(url.pathname.slice('/v1/matches/'.length));
      const match = await matchReadApi.get(id);
      return match ? json(response, 200, await enrichMarkets(match)) : json(response, 404, { error: 'Match not found' });
    }
    if (betaService && request.method === 'GET' && url.pathname === '/v1/beta/status') {
      const owner = url.searchParams.get('owner');
      if (!owner) throw Object.assign(new Error('owner query parameter is required'), { status: 400 });
      return json(response, 200, await betaService.status(owner));
    }
    if (betaService && request.method === 'POST' && url.pathname === '/v1/beta/claim') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      return json(response, 200, await betaService.claim(body));
    }
    if (betaService && request.method === 'POST' && url.pathname === '/v1/beta/swap/prepare') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      return json(response, 200, await betaService.prepareSwap(body));
    }
    if (betaService && request.method === 'POST' && url.pathname === '/v1/beta/swap/submit') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      return json(response, 200, await betaService.submitSwap(body));
    }
    if (request.method === 'POST' && url.pathname === '/v1/positions/settlement/transaction') {
      const instruction = await buildSettlementInstruction(await readBody(request));
      return json(response, 200, instruction);
    }
    if (url.pathname.startsWith('/v1/admin/')) {
      adminGuard(url);
      if (!matchReadApi) {
        throw Object.assign(new Error('Admin API requires the PostgreSQL match source'), { status: 503 });
      }
      const repository = matchReadApi.repository;
      const pool = repository.pool;
      const { listProfiles, createProfile, updateProfile, deleteProfile } = require('../backend/src/profiles');
      const { listInvites, createInvites, revokeInvite, listTesters, setTesterBlocked } = require('../backend/src/invites');

      if (request.method === 'GET' && url.pathname === '/v1/admin/status') {
        const [matches, invites, testers] = await Promise.all([
          repository.listMatches(undefined, 500),
          listInvites(pool),
          listTesters(pool),
        ]);
        const byStatus = matches.reduce((acc, row) => {
          acc[row.status] = (acc[row.status] || 0) + 1;
          return acc;
        }, {});
        return json(response, 200, {
          matches: { total: matches.length, byStatus },
          invites: {
            total: invites.length,
            active: invites.filter((invite) => invite.status === 'ACTIVE').length,
          },
          testers: {
            total: testers.length,
            blocked: testers.filter((tester) => tester.blocked).length,
          },
          float: betaService
            ? await betaService.status('11111111111111111111111111111111').then((s) => s.float).catch(() => null)
            : null,
        });
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/matches') {
        const rows = await repository.listMatches(undefined, 200);
        const ids = rows.map((row) => row.id);
        const { rows: commandRows } = ids.length
          ? await pool.query(
              `SELECT match_id, command_type, status, transaction_signature, error, attempts, created_at
                 FROM market_commands WHERE match_id = ANY($1::text[]) ORDER BY created_at DESC`,
              [ids],
            )
          : { rows: [] };
        const commandsByMatch = new Map();
        for (const command of commandRows) {
          if (!commandsByMatch.has(command.match_id)) commandsByMatch.set(command.match_id, []);
          commandsByMatch.get(command.match_id).push({
            type: command.command_type,
            status: command.status,
            signature: command.transaction_signature,
            error: command.error,
            attempts: Number(command.attempts),
            createdAt: new Date(command.created_at).toISOString(),
          });
        }
        return json(response, 200, rows.map((row) => ({
          id: row.id,
          title: row.title,
          category: row.category,
          status: row.status,
          white: row.white_profile?.name || 'White',
          black: row.black_profile?.name || 'Black',
          whiteAgentId: row.white_profile?.id || '',
          blackAgentId: row.black_profile?.id || '',
          currentPly: Number(row.current_ply),
          result: row.result,
          terminationReason: row.termination_reason,
          marketAddress: row.market_address,
          vaultAddress: row.vault_address,
          marketLockTime: row.market_lock_time ? new Date(row.market_lock_time).toISOString() : null,
          createdAt: new Date(row.created_at).toISOString(),
          startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
          completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
          commands: commandsByMatch.get(row.id) || [],
        })));
      }

      if (request.method === 'POST' && url.pathname === '/v1/admin/matches') {
        const body = await readBody(request);
        const { autoPairMatch } = require('../backend/src/matchmaker');
        const paired = await autoPairMatch({
          databaseUrl: process.env.FERAS_DATABASE_URL,
          matchId: body.matchId,
          title: body.title,
          category: body.category || 'BENCHMARK',
          countdownMinutes: Number(body.countdownMinutes || 15),
          whiteAgentId: body.whiteAgentId,
          blackAgentId: body.blackAgentId,
          swapColors: body.swapColors === true,
          baseTimeMs: Number(body.baseTimeMs || 180_000),
          incrementMs: Number(body.incrementMs || 2_000),
        });
        return json(response, 201, paired);
      }

      const matchAction = url.pathname.match(/^\/v1\/admin\/matches\/([^/]+)\/(result|cancel|lock)$/);
      if (matchAction) {
        const id = decodeURIComponent(matchAction[1]);
        const action = matchAction[2];
        if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed' });
        if (action === 'result') {
          const body = await readBody(request);
          return json(response, 200, await repository.forceResult(id, {
            result: body.result,
            terminationReason: body.terminationReason || 'Result set by operator',
          }));
        }
        if (action === 'cancel') {
          const body = await readBody(request);
          return json(response, 200, await repository.cancelMatch(id, body.reason || 'Cancelled by operator'));
        }
        return json(response, 200, await repository.forceLock(id));
      }

      const deleteMatch = url.pathname.match(/^\/v1\/admin\/matches\/([^/]+)$/);
      if (deleteMatch && request.method === 'DELETE') {
        return json(response, 200, await repository.deleteMatch(decodeURIComponent(deleteMatch[1])));
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/profiles') {
        return json(response, 200, await listProfiles(pool));
      }
      if (request.method === 'POST' && url.pathname === '/v1/admin/profiles') {
        return json(response, 201, await createProfile(pool, await readBody(request)));
      }
      const profileAction = url.pathname.match(/^\/v1\/admin\/profiles\/([^/]+)$/);
      if (profileAction) {
        const id = decodeURIComponent(profileAction[1]);
        if (request.method === 'PUT' || request.method === 'PATCH') {
          return json(response, 200, await updateProfile(pool, id, await readBody(request)));
        }
        if (request.method === 'DELETE') {
          return json(response, 200, await deleteProfile(pool, id));
        }
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/invites') {
        return json(response, 200, await listInvites(pool));
      }
      if (request.method === 'POST' && url.pathname === '/v1/admin/invites') {
        const origin = process.env.FERAS_BETA_WEB_ORIGIN || 'https://dllxy64bv69x8.cloudfront.net';
        return json(response, 201, await createInvites(pool, await readBody(request), { origin }));
      }
      const inviteAction = url.pathname.match(/^\/v1\/admin\/invites\/([^/]+)\/revoke$/);
      if (inviteAction && request.method === 'POST') {
        return json(response, 200, await revokeInvite(pool, decodeURIComponent(inviteAction[1])));
      }

      if (request.method === 'GET' && url.pathname === '/v1/admin/testers') {
        return json(response, 200, await listTesters(pool));
      }
      const testerAction = url.pathname.match(/^\/v1\/admin\/testers\/([^/]+)\/block$/);
      if (testerAction && request.method === 'POST') {
        const body = await readBody(request);
        return json(response, 200, await setTesterBlocked(pool, decodeURIComponent(testerAction[1]), body.blocked === true));
      }

      return json(response, 404, { error: 'Unknown admin route' });
    }
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
    const status = Number(error?.status);
    return json(response, Number.isInteger(status) && status >= 400 && status <= 599 ? status : 422, {
      error: error instanceof Error ? error.message : 'Invalid request',
    });
  }
}

http.createServer((request, response) => {
  void handle(request, response);
}).listen(PORT, () => {
  process.stdout.write(`Feras Devnet market API listening on :${PORT}\n`);
});
