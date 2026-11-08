'use strict';

/*
 * Private beta credit service.
 *
 * Responsibilities:
 *  - redeem single-use invite codes and bind them to one Solana wallet
 *  - send the starter grant (SOL + test-USDC) atomically from the beta float
 *  - keep an auditable ledger so a wallet can never be paid twice
 *
 * The float can never mint: the test-USDC mint authority is revoked on-chain.
 * The only way credits enter circulation is a transfer from the pre-minted
 * supply the operator moved into the float.
 */

const crypto = require('node:crypto');
const nacl = require('tweetnacl');
const { Pool } = require('pg');
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} = require('@solana/spl-token');
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} = require('@coral-xyz/anchor').web3;

const USDC_DECIMALS = 6;
const USDC_BASE = 10n ** BigInt(USDC_DECIMALS);
const LAMPORTS_PER_SOL = 1_000_000_000;
const CLAIM_MESSAGE_PREFIX = 'feras-beta-claim:v1';
const SWAP_MESSAGE_PREFIX = 'feras-beta-swap:v1';
const MAX_SIGNATURE_SKEW_MS = 5 * 60 * 1000;
// How long a prepared top-up keeps its reserved daily allowance. After this the
// ledger row is marked FAILED so the caps are released.
const SWAP_REQUEST_TTL_MS = 10 * 60 * 1000;
const DAILY_WINDOW = '24 hours';
const DEFAULT_STARTER_SOL = 0.25;
const DEFAULT_STARTER_USDC = 25;
const DEFAULT_SOL_TO_USDC_RATE = 150;
const DEFAULT_SWAP_MIN_USDC = 5;
const DEFAULT_SWAP_MAX_USDC = 100;
const DEFAULT_DAILY_USDC = 100;
const DEFAULT_DAILY_SOL = 0.5;
const DEFAULT_GLOBAL_DAILY_USDC = 1000;

// SPKI DER prefix for a raw Ed25519 public key (RFC 8410).
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function parsePublicKey(value, label) {
  try {
    return new PublicKey(value);
  } catch {
    throw httpError(400, `${label} must be a valid Solana address`);
  }
}

function buildClaimMessage({ wallet, code, issuedAt }) {
  return `${CLAIM_MESSAGE_PREFIX}:${wallet}:${normalizeCode(code)}:${issuedAt}`;
}

function buildSwapMessage({ wallet, usdcBaseUnits, issuedAt }) {
  return `${SWAP_MESSAGE_PREFIX}:${wallet}:${usdcBaseUnits}:${issuedAt}`;
}

function verifyWalletSignature({ message, signature, publicKey }) {
  const signatureBytes = Buffer.from(signature, 'base64');
  if (signatureBytes.length !== 64) return false;
  const key = crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey.toBuffer()]),
    format: 'der',
    type: 'spki',
  });
  try {
    return crypto.verify(null, Buffer.from(message, 'utf8'), key, signatureBytes);
  } catch {
    return false;
  }
}

function solToLamports(value) {
  const sol = Number(value);
  if (!Number.isFinite(sol) || sol < 0) throw new Error('Invalid SOL amount');
  return Math.round(sol * LAMPORTS_PER_SOL);
}

function usdcToBaseUnits(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid USDC amount');
  return BigInt(Math.round(amount * Number(USDC_BASE)));
}

function baseUnitsToUsdc(value) {
  return Number(BigInt(value)) / Number(USDC_BASE);
}

/**
 * Lamports a tester pays for `usdcUnits` test-USDC at `rate` (USDC per SOL).
 * Rounded up so the float never loses value to truncation.
 */
function usdcToLamports(usdcUnits, rate) {
  const units = BigInt(usdcUnits);
  if (units <= 0n) throw new Error('Invalid USDC amount');
  const rateUnits = BigInt(Math.round(Number(rate) * Number(USDC_BASE)));
  if (rateUnits <= 0n) throw new Error('Invalid SOL/USDC rate');
  const numerator = units * BigInt(LAMPORTS_PER_SOL);
  return (numerator + rateUnits - 1n) / rateUnits;
}

function hintFromError(error, fallback) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/insufficient funds|insufficient lamports/i.test(message)) {
    return 'The wallet does not have enough Devnet SOL for this top-up.';
  }
  if (/blockhash not found|block height exceeded|has expired/i.test(message)) {
    return 'The top-up request expired. Please try again.';
  }
  return message.trim() || fallback;
}

function encodeBase58(bytes) {
  const loaded = require('bs58');
  const bs58 = loaded.default ?? loaded;
  return bs58.encode(bytes);
}

/**
 * Check that a client-signed top-up transaction is exactly the one the service
 * prepared: the tester pays SOL to the float, the float pays test-USDC to the
 * tester's associated token account, and nothing else moves. The float only
 * adds its signature after this check passes.
 */
function verifySwapTransaction(input) {
  const {
    serialized,
    walletKey,
    mintKey,
    treasuryKey,
    treasuryAta,
    walletAta,
    lamports,
    usdcUnits,
  } = input;

  let transaction;
  try {
    transaction = Transaction.from(serialized);
  } catch {
    throw httpError(400, 'The top-up transaction could not be read');
  }
  if (!transaction.feePayer?.equals(walletKey)) {
    throw httpError(400, 'The top-up transaction has the wrong fee payer');
  }

  const walletEntry = transaction.signatures.find((entry) => entry.publicKey.equals(walletKey));
  if (!walletEntry?.signature) {
    throw httpError(401, 'The top-up transaction is not signed by the wallet');
  }
  let validSignature = false;
  try {
    validSignature = nacl.sign.detached.verify(
      transaction.serializeMessage(),
      walletEntry.signature,
      walletKey.toBytes(),
    );
  } catch {
    validSignature = false;
  }
  if (!validSignature) {
    throw httpError(401, 'The top-up transaction has an invalid wallet signature');
  }

  let seenSol = false;
  let seenUsdc = false;
  let seenAta = false;

  for (const instruction of transaction.instructions) {
    if (instruction.programId.equals(SystemProgram.programId)) {
      if (seenSol || instruction.data.length !== 12 || instruction.data.readUInt32LE(0) !== 2) {
        throw httpError(400, 'Unexpected instruction in the top-up transaction');
      }
      const [from, to] = instruction.keys.map((key) => key.pubkey);
      const value = instruction.data.readBigUInt64LE(4);
      if (!from?.equals(walletKey) || !to?.equals(treasuryKey) || value !== BigInt(lamports)) {
        throw httpError(400, 'The top-up transaction pays the wrong SOL amount');
      }
      seenSol = true;
      continue;
    }

    if (instruction.programId.equals(TOKEN_PROGRAM_ID)) {
      if (seenUsdc || instruction.data.length !== 10 || instruction.data[0] !== 12) {
        throw httpError(400, 'Unexpected token instruction in the top-up transaction');
      }
      const [source, mint, destination, authority] = instruction.keys.map((key) => key.pubkey);
      const amount = instruction.data.readBigUInt64LE(1);
      const decimals = instruction.data[9];
      if (
        !source?.equals(treasuryAta) ||
        !mint?.equals(mintKey) ||
        !destination?.equals(walletAta) ||
        !authority?.equals(treasuryKey) ||
        amount !== BigInt(usdcUnits) ||
        decimals !== USDC_DECIMALS
      ) {
        throw httpError(400, 'The top-up transaction sends the wrong test-USDC amount');
      }
      seenUsdc = true;
      continue;
    }

    if (instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      if (seenAta || instruction.data.length !== 1 || instruction.data[0] !== 1 || instruction.keys.length < 4) {
        throw httpError(400, 'Unexpected account instruction in the top-up transaction');
      }
      const [payer, ata, owner, mint] = instruction.keys.map((key) => key.pubkey);
      if (!payer?.equals(walletKey) || !ata?.equals(walletAta) || !owner?.equals(walletKey) || !mint?.equals(mintKey)) {
        throw httpError(400, 'The top-up transaction prepares the wrong token account');
      }
      seenAta = true;
      continue;
    }

    throw httpError(400, 'Unexpected instruction in the top-up transaction');
  }

  if (!seenSol || !seenUsdc || !seenAta) {
    throw httpError(400, 'The top-up transaction is incomplete');
  }

  const signatureBytes = transaction.signatures[0]?.signature;
  if (!signatureBytes) throw httpError(400, 'The top-up transaction is not signed');

  return { transaction, signature: encodeBase58(signatureBytes) };
}

function loadTreasuryKeypair(secret) {
  if (!secret) return null;
  const trimmed = secret.trim();
  let bytes;
  if (trimmed.startsWith('[')) {
    bytes = Uint8Array.from(JSON.parse(trimmed));
  } else {
    // Base58 is accepted for convenience, but the documented format is the
    // JSON array produced by `solana-keygen new --outfile`.
    let bs58;
    try {
      bs58 = require('bs58');
    } catch {
      throw new Error('Base58 treasury keys require the bs58 package; use the JSON key array instead');
    }
    bytes = bs58.decode(trimmed);
  }
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  if (bytes.length !== 64) throw new Error('FERAS_BETA_TREASURY_SECRET_KEY must be a 32-byte seed or 64-byte secret key');
  return Keypair.fromSecretKey(bytes);
}

function readLimits(env = process.env) {
  const number = (name, fallback) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    starterSol: number('FERAS_BETA_STARTER_SOL', DEFAULT_STARTER_SOL),
    starterUsdc: number('FERAS_BETA_STARTER_USDC', DEFAULT_STARTER_USDC),
    solToUsdcRate: number('FERAS_BETA_SOL_TO_USDC', DEFAULT_SOL_TO_USDC_RATE),
    swapMinUsdc: number('FERAS_BETA_SWAP_MIN_USDC', DEFAULT_SWAP_MIN_USDC),
    swapMaxUsdc: number('FERAS_BETA_SWAP_MAX_USDC', DEFAULT_SWAP_MAX_USDC),
    dailyUsdc: number('FERAS_BETA_DAILY_USDC', DEFAULT_DAILY_USDC),
    dailySol: number('FERAS_BETA_DAILY_SOL', DEFAULT_DAILY_SOL),
    globalDailyUsdc: number('FERAS_BETA_GLOBAL_DAILY_USDC', DEFAULT_GLOBAL_DAILY_USDC),
    disabled: String(env.FERAS_BETA_DISABLED ?? '').toLowerCase() === 'true',
  };
}

function createBetaService(options) {
  const {
    databaseUrl,
    rpcUrl,
    mint,
    treasurySecret,
    expectedTreasury,
    env = process.env,
  } = options;

  const pool = new Pool({ connectionString: databaseUrl, max: Number(env.FERAS_DB_POOL_SIZE || 4) });
  const connection = new Connection(rpcUrl, { commitment: 'confirmed' });
  const mintKey = parsePublicKey(mint, 'FERAS_DEVNET_USDC_MINT');
  const limits = readLimits(env);

  let treasury = null;
  let disabledReason = null;
  try {
    treasury = loadTreasuryKeypair(treasurySecret);
  } catch (error) {
    disabledReason = error instanceof Error ? error.message : String(error);
  }
  if (treasury && expectedTreasury) {
    const expected = parsePublicKey(expectedTreasury, 'FERAS_BETA_TREASURY_ADDRESS');
    if (!treasury.publicKey.equals(expected)) {
      disabledReason = 'The beta treasury key does not match FERAS_BETA_TREASURY_ADDRESS';
      treasury = null;
    }
  }
  if (!treasury && !disabledReason) disabledReason = 'FERAS_BETA_TREASURY_SECRET_KEY is not set';
  if (limits.disabled) {
    disabledReason = 'Beta credits are paused';
    treasury = null;
  }

  const treasuryAddress = treasury?.publicKey.toBase58() ?? null;
  const treasuryUsdcAccount = treasury
    ? getAssociatedTokenAddressSync(mintKey, treasury.publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID).toBase58()
    : null;

  async function status(walletValue) {
    const wallet = parsePublicKey(walletValue, 'wallet').toBase58();
    const [tester, ledger, float, usage] = await Promise.all([
      pool.query('SELECT * FROM beta_testers WHERE wallet = $1', [wallet]),
      pool.query(
        `SELECT status, created_at, confirmed_at, tx_signature
           FROM beta_ledger
          WHERE wallet = $1 AND kind = 'STARTER_GRANT' AND status <> 'FAILED'
          ORDER BY created_at DESC LIMIT 1`,
        [wallet],
      ),
      treasury
        ? Promise.all([
            connection.getBalance(treasury.publicKey, 'confirmed').catch(() => null),
            connection.getTokenAccountBalance(
              getAssociatedTokenAddressSync(mintKey, treasury.publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
              'confirmed',
            ).catch(() => null),
          ])
        : Promise.resolve([null, null]),
      readSwapUsage(wallet).catch(() => ({ sol: 0n, usdc: 0n, globalUsdc: 0n })),
    ]);

    const grant = ledger.rows[0] ?? null;
    const row = tester.rows[0] ?? null;
    const floatSol = float[0] === null ? null : float[0] / LAMPORTS_PER_SOL;
    const floatUsdc = float[1] ? baseUnitsToUsdc(float[1].value.amount) : null;
    const floatReady = Boolean(
      treasury && floatSol !== null && floatUsdc !== null &&
      floatSol >= limits.starterSol + 0.01 && floatUsdc >= limits.starterUsdc,
    );

    // Remaining top-up allowance, expressed in test-USDC. The SOL side of the
    // cap can bind first, so report the smaller of the two.
    const usedUsdc = Number(usage.usdc) / Number(USDC_BASE);
    const usedSol = Number(usage.sol) / LAMPORTS_PER_SOL;
    const usdcByDaily = Math.max(0, limits.dailyUsdc - usedUsdc);
    const usdcBySol = Math.max(0, (limits.dailySol - usedSol) * limits.solToUsdcRate);
    const usdcRemaining = Math.floor(Math.min(usdcByDaily, usdcBySol) * 100) / 100;

    return {
      wallet,
      enabled: Boolean(treasury),
      disabledReason: treasury ? null : disabledReason,
      tester: row
        ? {
            inviteCode: row.invite_code,
            claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
            blocked: row.blocked,
          }
        : null,
      grant: grant
        ? {
            status: grant.status,
            requestedAt: new Date(grant.created_at).toISOString(),
            confirmedAt: grant.confirmed_at ? new Date(grant.confirmed_at).toISOString() : null,
            explorerUrl: grant.tx_signature
              ? `https://explorer.solana.com/tx/${grant.tx_signature}?cluster=devnet`
              : null,
          }
        : null,
      canClaim: Boolean(
        treasury && floatReady && !row?.blocked && !row?.claimed_at && !grant,
      ),
      canTopUp: Boolean(
        treasury && row?.claimed_at && !row?.blocked &&
        floatUsdc !== null && floatUsdc >= limits.swapMinUsdc &&
        usdcRemaining >= limits.swapMinUsdc,
      ),
      limits: {
        starterSol: limits.starterSol,
        starterUsdc: limits.starterUsdc,
        solToUsdcRate: limits.solToUsdcRate,
        swapMinUsdc: limits.swapMinUsdc,
        swapMaxUsdc: limits.swapMaxUsdc,
        dailyUsdc: limits.dailyUsdc,
        dailySol: limits.dailySol,
      },
      usage: {
        usdcToday: Math.round(usedUsdc * Number(USDC_BASE)) / Number(USDC_BASE),
        solToday: Math.round(usedSol * LAMPORTS_PER_SOL) / LAMPORTS_PER_SOL,
        usdcRemaining,
      },
      float: {
        address: treasuryAddress,
        usdc: floatUsdc,
        sol: floatSol,
      },
    };
  }

  async function claim({ wallet, code, issuedAt, signature }) {
    if (!treasury) throw httpError(503, disabledReason || 'Beta credits are not enabled');

    const walletKey = parsePublicKey(wallet, 'wallet');
    const walletAddress = walletKey.toBase58();
    const inviteCode = normalizeCode(code);
    if (!inviteCode) throw httpError(400, 'An invite code is required');

    const issued = Number(issuedAt);
    if (!Number.isSafeInteger(issued) || Math.abs(Date.now() - issued) > MAX_SIGNATURE_SKEW_MS) {
      throw httpError(401, 'The wallet signature expired; please try again');
    }
    const message = buildClaimMessage({ wallet: walletAddress, code: inviteCode, issuedAt: issued });
    if (!verifyWalletSignature({ message, signature, publicKey: walletKey })) {
      throw httpError(401, 'The wallet signature is invalid');
    }

    // Fast path: this wallet already received (or is receiving) its grant.
    const existing = await pool.query(
      `SELECT 1 FROM beta_ledger
        WHERE wallet = $1 AND kind = 'STARTER_GRANT' AND status <> 'FAILED'
        LIMIT 1`,
      [walletAddress],
    );
    if (existing.rowCount) {
      return { status: 'ALREADY_CLAIMED', wallet: walletAddress };
    }

    const client = await pool.connect();
    let ledgerId = null;
    let grantSol = limits.starterSol;
    let grantUsdc = limits.starterUsdc;
    try {
      await client.query('BEGIN');
      const invite = (await client.query('SELECT * FROM beta_invites WHERE code = $1 FOR UPDATE', [inviteCode])).rows[0];
      if (!invite || invite.revoked) throw httpError(404, 'That invite code is not valid');
      if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
        throw httpError(410, 'That invite code has expired');
      }
      if (Number(invite.claim_count) >= Number(invite.max_claims)) {
        throw httpError(409, 'That invite code has already been used to its limit');
      }

      const tester = (await client.query('SELECT * FROM beta_testers WHERE wallet = $1 FOR UPDATE', [walletAddress])).rows[0];
      if (tester?.blocked) throw httpError(403, 'This wallet is not eligible for beta credits');
      if (tester?.claimed_at) throw httpError(409, 'This wallet already claimed beta credits');
      if (tester && tester.invite_code !== inviteCode) {
        throw httpError(409, 'This wallet is already bound to a different invite');
      }

      grantSol = Number(invite.starter_sol);
      grantUsdc = Number(invite.starter_usdc);

      if (!tester) {
        await client.query(
          'INSERT INTO beta_testers (wallet, invite_code) VALUES ($1, $2)',
          [walletAddress, inviteCode],
        );
      }

      const inserted = await client.query(
        `INSERT INTO beta_ledger
           (wallet, kind, status, sol_lamports, usdc_base_units, usdc_mint, metadata)
         VALUES ($1, 'STARTER_GRANT', 'PENDING', $2, $3, $4, $5)
         RETURNING id`,
        [
          walletAddress,
          solToLamports(grantSol),
          usdcToBaseUnits(grantUsdc).toString(),
          mintKey.toBase58(),
          JSON.stringify({ inviteCode }),
        ],
      );
      ledgerId = inserted.rows[0].id;

      await client.query('UPDATE beta_invites SET claim_count = claim_count + 1 WHERE code = $1', [inviteCode]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    let txSignature;
    try {
      const solLamports = solToLamports(grantSol);
      const usdcUnits = usdcToBaseUnits(grantUsdc);
      const transaction = new Transaction();
      transaction.feePayer = treasury.publicKey;

      if (solLamports > 0) {
        transaction.add(SystemProgram.transfer({
          fromPubkey: treasury.publicKey,
          toPubkey: walletKey,
          lamports: solLamports,
        }));
      }

      if (usdcUnits > 0n) {
        const source = getAssociatedTokenAddressSync(mintKey, treasury.publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const destination = getAssociatedTokenAddressSync(mintKey, walletKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        transaction.add(createAssociatedTokenAccountIdempotentInstruction(
          treasury.publicKey,
          destination,
          walletKey,
          mintKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ));
        transaction.add(createTransferCheckedInstruction(
          source,
          mintKey,
          destination,
          treasury.publicKey,
          usdcUnits,
          USDC_DECIMALS,
          [],
          TOKEN_PROGRAM_ID,
        ));
      }

      const latest = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = latest.blockhash;
      transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
      transaction.sign(treasury);

      txSignature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      const confirmation = await connection.confirmTransaction(
        { signature: txSignature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
        'confirmed',
      );
      if (confirmation.value.err) throw new Error('The starter grant transaction failed on-chain');

      await pool.query(
        `UPDATE beta_ledger SET status = 'CONFIRMED', tx_signature = $2, confirmed_at = NOW() WHERE id = $1`,
        [ledgerId, txSignature],
      );
      await pool.query('UPDATE beta_testers SET claimed_at = NOW(), last_seen_at = NOW() WHERE wallet = $1', [walletAddress]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await pool.query(
        `UPDATE beta_ledger SET status = 'FAILED', error = $2, tx_signature = $3 WHERE id = $1`,
        [ledgerId, message, txSignature ?? null],
      ).catch(() => undefined);
      // Returning the invite slot is safe: the ledger row is FAILED, so a retry
      // is allowed and the unique index no longer blocks it.
      await pool.query('UPDATE beta_invites SET claim_count = GREATEST(claim_count - 1, 0) WHERE code = $1', [inviteCode])
        .catch(() => undefined);
      throw httpError(502, `The starter grant could not be sent: ${message}`);
    }

    return {
      status: 'CLAIMED',
      wallet: walletAddress,
      signature: txSignature,
      explorerUrl: `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`,
      grant: { sol: grantSol, usdc: grantUsdc },
    };
  }

  async function expireSwapRequests() {
    await pool.query(
      `UPDATE beta_ledger
          SET status = 'FAILED', error = 'Top-up request expired'
        WHERE kind = 'SWAP' AND status = 'PENDING'
          AND created_at < NOW() - ($1 * INTERVAL '1 millisecond')`,
      [SWAP_REQUEST_TTL_MS],
    );
  }

  async function readSwapUsage(walletAddress, client = pool) {
    const [walletRows, globalRows] = await Promise.all([
      client.query(
        `SELECT COALESCE(SUM(sol_lamports), 0)::text AS sol,
                COALESCE(SUM(usdc_base_units), 0)::text AS usdc
           FROM beta_ledger
          WHERE wallet = $1 AND kind = 'SWAP' AND status <> 'FAILED'
            AND created_at > NOW() - INTERVAL '24 hours'`,
        [walletAddress],
      ),
      client.query(
        `SELECT COALESCE(SUM(usdc_base_units), 0)::text AS usdc
           FROM beta_ledger
          WHERE kind = 'SWAP' AND status <> 'FAILED'
            AND created_at > NOW() - INTERVAL '24 hours'`,
      ),
    ]);
    return {
      sol: BigInt(walletRows.rows[0].sol),
      usdc: BigInt(walletRows.rows[0].usdc),
      globalUsdc: BigInt(globalRows.rows[0].usdc),
    };
  }

  function topUpError(reason) {
    return httpError(429, reason);
  }

  /**
   * Reserve a top-up and return a treasury-signed Solana transaction for the
   * tester to sign. The SOL and test-USDC legs settle atomically or not at all.
   */
  async function prepareSwap({ wallet, usdc, issuedAt, signature }) {
    if (!treasury) throw httpError(503, disabledReason || 'Beta credits are not enabled');

    const walletKey = parsePublicKey(wallet, 'wallet');
    const walletAddress = walletKey.toBase58();

    const issued = Number(issuedAt);
    if (!Number.isSafeInteger(issued) || Math.abs(Date.now() - issued) > MAX_SIGNATURE_SKEW_MS) {
      throw httpError(401, 'The wallet signature expired; please try again');
    }

    const requested = Number(usdc);
    if (!Number.isFinite(requested) || requested <= 0) {
      throw httpError(400, 'Choose how much test credit to add');
    }
    const usdcUnits = usdcToBaseUnits(requested);
    if (usdcUnits <= 0n) throw httpError(400, 'Choose how much test credit to add');
    const usdcValue = Number(usdcUnits) / Number(USDC_BASE);

    if (usdcValue < limits.swapMinUsdc) {
      throw httpError(400, `The minimum top-up is ${limits.swapMinUsdc} test-USDC`);
    }
    if (usdcValue > limits.swapMaxUsdc) {
      throw httpError(400, `The maximum top-up is ${limits.swapMaxUsdc} test-USDC`);
    }

    const message = buildSwapMessage({ wallet: walletAddress, usdcBaseUnits: usdcUnits.toString(), issuedAt: issued });
    if (!verifyWalletSignature({ message, signature, publicKey: walletKey })) {
      throw httpError(401, 'The wallet signature is invalid');
    }

    const tester = (await pool.query('SELECT * FROM beta_testers WHERE wallet = $1', [walletAddress])).rows[0];
    if (!tester) throw httpError(403, 'Beta credits are invite-only');
    if (tester.blocked) throw httpError(403, 'This wallet is not eligible for beta credits');
    if (!tester.claimed_at) throw httpError(403, 'Claim your starter credits before topping up');

    await expireSwapRequests();

    const lamports = usdcToLamports(usdcUnits, limits.solToUsdcRate);
    const dailyUsdcUnits = usdcToBaseUnits(limits.dailyUsdc);
    const dailySolLamports = BigInt(solToLamports(limits.dailySol));
    const globalUsdcUnits = usdcToBaseUnits(limits.globalDailyUsdc);

    const treasuryAta = getAssociatedTokenAddressSync(
      mintKey, treasury.publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const floatBalance = await connection.getTokenAccountBalance(treasuryAta, 'confirmed').catch(() => null);
    if (!floatBalance || BigInt(floatBalance.value.amount) < usdcUnits) {
      throw httpError(503, 'The beta float needs a refill before more credit can be added');
    }

    const client = await pool.connect();
    let swapId;
    try {
      await client.query('BEGIN');
      // One lock for all top-ups keeps the per-wallet and global caps honest
      // even when two requests arrive at the same moment.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['feras_beta_swap']);
      const usage = await readSwapUsage(walletAddress, client);

      if (usage.usdc + usdcUnits > dailyUsdcUnits) {
        throw topUpError(`Daily top-up limit reached. You can add ${limits.dailyUsdc} test-USDC per day.`);
      }
      if (usage.sol + lamports > dailySolLamports) {
        throw topUpError('Daily SOL spend limit reached. Try again tomorrow.');
      }
      if (usage.globalUsdc + usdcUnits > globalUsdcUnits) {
        throw topUpError('The beta float reached its daily limit. Try again later.');
      }

      const inserted = await client.query(
        `INSERT INTO beta_ledger
           (wallet, kind, status, sol_lamports, usdc_base_units, usdc_mint, metadata)
         VALUES ($1, 'SWAP', 'PENDING', $2, $3, $4, $5)
         RETURNING id`,
        [
          walletAddress,
          lamports.toString(),
          usdcUnits.toString(),
          mintKey.toBase58(),
          JSON.stringify({ rate: limits.solToUsdcRate, issuedAt: issued }),
        ],
      );
      swapId = inserted.rows[0].id;
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    try {
      const walletAta = getAssociatedTokenAddressSync(
        mintKey, walletKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      // Return raw instructions; the tester's wallet builds and signs a normal
      // single-signer transaction. The float adds its signature only after the
      // server has verified the exact instruction set.
      const instructions = [
        SystemProgram.transfer({
          fromPubkey: walletKey,
          toPubkey: treasury.publicKey,
          lamports: Number(lamports),
        }),
        createAssociatedTokenAccountIdempotentInstruction(
          walletKey,
          walletAta,
          walletKey,
          mintKey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        ),
        createTransferCheckedInstruction(
          treasuryAta,
          mintKey,
          walletAta,
          treasury.publicKey,
          usdcUnits,
          USDC_DECIMALS,
          [],
          TOKEN_PROGRAM_ID,
        ),
      ].map((instruction) => ({
        programId: instruction.programId.toBase58(),
        keys: instruction.keys.map((key) => ({
          pubkey: key.pubkey.toBase58(),
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: instruction.data.toString('base64'),
      }));

      return {
        swapId,
        instructions,
        usdc: usdcValue,
        sol: Number(lamports) / LAMPORTS_PER_SOL,
        rate: limits.solToUsdcRate,
        expiresAt: new Date(Date.now() + SWAP_REQUEST_TTL_MS).toISOString(),
      };
    } catch (error) {
      await pool.query(
        `UPDATE beta_ledger SET status = 'FAILED', error = $2 WHERE id = $1`,
        [swapId, hintFromError(error, 'The top-up could not be prepared')],
      ).catch(() => undefined);
      throw httpError(502, hintFromError(error, 'The top-up could not be prepared'));
    }
  }

  /**
   * Accept the tester-signed transaction, verify it instruction by instruction,
   * submit it, and settle the ledger row.
   */
  async function submitSwap({ swapId, wallet, transaction }) {
    if (!treasury) throw httpError(503, disabledReason || 'Beta credits are not enabled');

    const walletKey = parsePublicKey(wallet, 'wallet');
    const walletAddress = walletKey.toBase58();
    const id = Number(swapId);
    if (!Number.isSafeInteger(id) || id <= 0) throw httpError(400, 'A top-up request is required');
    if (typeof transaction !== 'string' || transaction.length < 100) {
      throw httpError(400, 'The signed top-up transaction is required');
    }

    const row = (await pool.query(
      `SELECT * FROM beta_ledger WHERE id = $1 AND wallet = $2 AND kind = 'SWAP'`,
      [id, walletAddress],
    )).rows[0];
    if (!row) throw httpError(404, 'Top-up request not found');

    if (row.status === 'CONFIRMED') {
      return {
        status: 'CONFIRMED',
        swapId: id,
        signature: row.tx_signature,
        explorerUrl: row.tx_signature
          ? `https://explorer.solana.com/tx/${row.tx_signature}?cluster=devnet`
          : null,
        usdc: baseUnitsToUsdc(row.usdc_base_units),
        sol: Number(row.sol_lamports) / LAMPORTS_PER_SOL,
      };
    }
    if (row.status !== 'PENDING') throw httpError(409, 'This top-up request is already closed');

    const age = Date.now() - new Date(row.created_at).getTime();
    if (age > SWAP_REQUEST_TTL_MS) {
      await pool.query(
        `UPDATE beta_ledger SET status = 'FAILED', error = 'Top-up request expired' WHERE id = $1`,
        [id],
      );
      throw httpError(410, 'The top-up request expired. Please try again.');
    }

    const treasuryAta = getAssociatedTokenAddressSync(
      mintKey, treasury.publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
    );
    const walletAta = getAssociatedTokenAddressSync(
      mintKey, walletKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    let verified;
    try {
      verified = verifySwapTransaction({
        serialized: Buffer.from(transaction, 'base64'),
        walletKey,
        mintKey,
        treasuryKey: treasury.publicKey,
        treasuryAta,
        walletAta,
        lamports: BigInt(row.sol_lamports),
        usdcUnits: BigInt(row.usdc_base_units),
      });
    } catch (error) {
      if (error?.status === 400) throw error;
      throw httpError(400, 'The signed top-up transaction could not be verified');
    }

    let signature = verified.signature;
    try {
      verified.transaction.partialSign(treasury);
      await connection.sendRawTransaction(verified.transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
    } catch (error) {
      // The tester may have submitted the same transaction directly; if it is
      // on-chain, treat it as success instead of failing their top-up.
      const status = await connection.getSignatureStatuses([signature]).catch(() => null);
      const value = status?.value?.[0];
      if (value?.err) {
        const reason = hintFromError(error, 'The top-up transaction failed on-chain');
        await pool.query(
          `UPDATE beta_ledger SET status = 'FAILED', error = $2, tx_signature = $3 WHERE id = $1`,
          [id, reason, signature],
        ).catch(() => undefined);
        throw httpError(502, reason);
      }
      if (!value) {
        const reason = hintFromError(error, 'The top-up could not be submitted');
        await pool.query(
          `UPDATE beta_ledger SET status = 'FAILED', error = $2 WHERE id = $1`,
          [id, reason],
        ).catch(() => undefined);
        throw httpError(502, reason);
      }
    }

    try {
      const deadline = Date.now() + 60_000;
      for (;;) {
        const status = await connection.getSignatureStatuses([signature]);
        const value = status.value[0];
        if (value?.err) throw new Error('The top-up transaction failed on-chain');
        if (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized') break;
        if (Date.now() > deadline) throw new Error('The top-up is still confirming; refresh in a moment');
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (error) {
      const status = await connection.getSignatureStatuses([signature]).catch(() => null);
      const value = status?.value?.[0];
      if (!value?.err && (value?.confirmationStatus === 'confirmed' || value?.confirmationStatus === 'finalized')) {
        // Landed despite the confirmation timeout.
      } else {
        const reason = hintFromError(error, 'The top-up could not be confirmed');
        await pool.query(
          `UPDATE beta_ledger SET status = 'FAILED', error = $2, tx_signature = $3 WHERE id = $1`,
          [id, reason, signature],
        ).catch(() => undefined);
        throw httpError(502, reason);
      }
    }

    await pool.query(
      `UPDATE beta_ledger SET status = 'CONFIRMED', tx_signature = $2, confirmed_at = NOW() WHERE id = $1`,
      [id, signature],
    );
    await pool.query('UPDATE beta_testers SET last_seen_at = NOW() WHERE wallet = $1', [walletAddress]);

    return {
      status: 'CONFIRMED',
      swapId: id,
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
      usdc: baseUnitsToUsdc(row.usdc_base_units),
      sol: Number(row.sol_lamports) / LAMPORTS_PER_SOL,
    };
  }

  async function close() {
    await pool.end();
  }

  return {
    status,
    claim,
    prepareSwap,
    submitSwap,
    close,
    enabled: Boolean(treasury),
    disabledReason,
    treasuryAddress,
    treasuryUsdcAccount,
    limits,
  };
}

module.exports = {
  CLAIM_MESSAGE_PREFIX,
  SWAP_MESSAGE_PREFIX,
  USDC_DECIMALS,
  buildClaimMessage,
  buildSwapMessage,
  createBetaService,
  httpError,
  normalizeCode,
  readLimits,
  solToLamports,
  usdcToBaseUnits,
  usdcToLamports,
  verifySwapTransaction,
  verifyWalletSignature,
};
