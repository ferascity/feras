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
const MAX_SIGNATURE_SKEW_MS = 5 * 60 * 1000;
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
    const [tester, ledger, float] = await Promise.all([
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
    ]);

    const grant = ledger.rows[0] ?? null;
    const row = tester.rows[0] ?? null;
    const floatSol = float[0] === null ? null : float[0] / LAMPORTS_PER_SOL;
    const floatUsdc = float[1] ? baseUnitsToUsdc(float[1].value.amount) : null;
    const floatReady = Boolean(
      treasury && floatSol !== null && floatUsdc !== null &&
      floatSol >= limits.starterSol + 0.01 && floatUsdc >= limits.starterUsdc,
    );

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
      limits: {
        starterSol: limits.starterSol,
        starterUsdc: limits.starterUsdc,
        solToUsdcRate: limits.solToUsdcRate,
        swapMinUsdc: limits.swapMinUsdc,
        swapMaxUsdc: limits.swapMaxUsdc,
        dailyUsdc: limits.dailyUsdc,
        dailySol: limits.dailySol,
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

  async function close() {
    await pool.end();
  }

  return {
    status,
    claim,
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
  USDC_DECIMALS,
  buildClaimMessage,
  createBetaService,
  httpError,
  normalizeCode,
  readLimits,
  solToLamports,
  usdcToBaseUnits,
  verifyWalletSignature,
};
