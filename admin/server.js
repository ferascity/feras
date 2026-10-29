#!/usr/bin/env node

/*
 * Local-only Devnet administration utility. It never exposes or serializes the
 * temporary CLI secret key; it only returns a transaction already signed by it.
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { randomBytes } = require('crypto');
const { ed25519 } = require('@noble/curves/ed25519');
const { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction, createTransferCheckedInstruction, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} = require('@solana/web3.js');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = process.env.FERAS_ADMIN_CONFIG_PATH || path.join(ROOT, 'config/devnet-release.env');
const HOST = '127.0.0.1';
const PORT = Number(process.env.FERAS_ADMIN_PORT || 8787);
const SET_AUTHORITY_CHECKED = Buffer.from([7, 0, 0, 0]);
const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');
const MAX_CLAIM_WINDOW_SECONDS = 180 * 24 * 60 * 60;
const IDL = require(path.join(ROOT, 'target/idl/feras_market.json'));
const INITIALIZE_CONFIG = IDL.instructions.find((instruction) => instruction.name === 'initialize_config');
const CREATE_MARKET = IDL.instructions.find((instruction) => instruction.name === 'create_market');
const LOCK_MARKET = IDL.instructions.find((instruction) => instruction.name === 'lock_market');
const marketDrafts = new Map();
const marketLockDrafts = new Map();
const distributionDrafts = new Map();

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parseEnvFile(file) {
  if (!fs.existsSync(file)) throw fail(`Missing local admin config: ${file}`, 500);
  const values = {};
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1).trim();
  }
  return values;
}

function publicKey(value, name) {
  try {
    return new PublicKey(value);
  } catch {
    throw fail(`${name} is not a valid public key`, 500);
  }
}

function localConfig() {
  const values = { ...parseEnvFile(CONFIG_PATH), ...process.env };
  const required = (name) => {
    if (!values[name]) throw fail(`${name} is required in the local admin configuration`, 500);
    return values[name];
  };
  return {
    rpcUrl: required('FERAS_SOLANA_RPC_URL'),
    programId: publicKey(required('FERAS_PROGRAM_ID'), 'FERAS_PROGRAM_ID'),
    expectedUpgradeAuthority: publicKey(required('FERAS_UPGRADE_AUTHORITY'), 'FERAS_UPGRADE_AUTHORITY'),
    platformAuthority: publicKey(required('FERAS_PLATFORM_AUTHORITY'), 'FERAS_PLATFORM_AUTHORITY'),
    settlementAuthority: publicKey(required('FERAS_SETTLEMENT_AUTHORITY'), 'FERAS_SETTLEMENT_AUTHORITY'),
    treasuryAuthority: publicKey(required('FERAS_TREASURY_AUTHORITY'), 'FERAS_TREASURY_AUTHORITY'),
    acceptedMint: publicKey(required('FERAS_DEVNET_USDC_MINT'), 'FERAS_DEVNET_USDC_MINT'),
    treasuryTokenAccount: publicKey(required('FERAS_TREASURY_TOKEN_ACCOUNT'), 'FERAS_TREASURY_TOKEN_ACCOUNT'),
    distributionAuthority: publicKey(required('FERAS_DISTRIBUTION_AUTHORITY'), 'FERAS_DISTRIBUTION_AUTHORITY'),
    cliKeypairPath: values.FERAS_ADMIN_KEYPAIR || null,
  };
}

function robustFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function connection(config) {
  return new Connection(config.rpcUrl, { commitment: 'confirmed', fetch: robustFetch });
}

function deriveAddresses(config) {
  const [programData] = PublicKey.findProgramAddressSync(
    [config.programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  );
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    config.programId,
  );
  return { programData, configPda };
}

async function currentUpgradeAuthority(rpc, programData) {
  const account = await rpc.getAccountInfo(programData, 'confirmed');
  if (!account || !account.owner.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID)) {
    throw fail('The deployed program data account is missing or uses an unexpected loader', 409);
  }
  // UpgradeableLoaderState::ProgramData: enum u32, deployment slot u64, Option<Pubkey>.
  if (account.data.length < 46 || account.data.readUInt32LE(0) !== 3) {
    throw fail('The derived ProgramData account has an unexpected layout', 409);
  }
  if (account.data[12] === 0) return null;
  if (account.data[12] !== 1) throw fail('The ProgramData upgrade authority option is malformed', 409);
  return new PublicKey(account.data.subarray(13, 45));
}

function loadCliAuthority(config) {
  if (!config.cliKeypairPath) {
    throw fail('FERAS_ADMIN_KEYPAIR must point to the temporary CLI authority keypair', 409);
  }
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(config.cliKeypairPath, 'utf8'))));
  } catch {
    throw fail('Unable to load FERAS_ADMIN_KEYPAIR', 500);
  }
}

function serializeTransaction(transaction) {
  return transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
}

function decodeTransaction(encoded) {
  if (typeof encoded !== 'string' || encoded.length < 8) throw fail('A signed transaction is required');
  try {
    return Transaction.from(Buffer.from(encoded, 'base64'));
  } catch {
    throw fail('The submitted transaction cannot be decoded');
  }
}

function accountMetaMatches(instruction, expected) {
  return instruction.keys.length === expected.length && instruction.keys.every((key, index) =>
    key.pubkey.equals(expected[index].pubkey) &&
    key.isSigner === expected[index].isSigner &&
    key.isWritable === expected[index].isWritable,
  );
}

function assertExactUpgradeTransaction(transaction, config, cliAuthority) {
  const { programData } = deriveAddresses(config);
  if (!transaction.feePayer?.equals(cliAuthority.publicKey) || transaction.instructions.length !== 1) {
    throw fail('Rejected: transaction shape differs from the reviewed upgrade-authority handoff', 409);
  }
  const instruction = transaction.instructions[0];
  const expectedKeys = [
    { pubkey: programData, isSigner: false, isWritable: true },
    // A legacy message promotes the fee payer to writable during compilation.
    { pubkey: cliAuthority.publicKey, isSigner: true, isWritable: true },
    { pubkey: config.expectedUpgradeAuthority, isSigner: true, isWritable: false },
  ];
  if (!instruction.programId.equals(BPF_LOADER_UPGRADEABLE_PROGRAM_ID) ||
      !instruction.data.equals(SET_AUTHORITY_CHECKED) ||
      !accountMetaMatches(instruction, expectedKeys)) {
    throw fail('Rejected: transaction does not exactly match the reviewed upgrade-authority instruction', 409);
  }
}

function readInitializeArgs(data) {
  const discriminator = Buffer.from(INITIALIZE_CONFIG.discriminator);
  if (data.length !== 82 || !data.subarray(0, 8).equals(discriminator)) return null;
  return {
    settlementAuthority: new PublicKey(data.subarray(8, 40)),
    treasuryAuthority: new PublicKey(data.subarray(40, 72)),
    feeBasisPoints: data.readUInt16LE(72),
    claimWindowSeconds: Number(data.readBigInt64LE(74)),
  };
}

function initializeData(config, feeBasisPoints, claimWindowSeconds) {
  const data = Buffer.alloc(82);
  Buffer.from(INITIALIZE_CONFIG.discriminator).copy(data, 0);
  config.settlementAuthority.toBuffer().copy(data, 8);
  config.treasuryAuthority.toBuffer().copy(data, 40);
  data.writeUInt16LE(feeBasisPoints, 72);
  data.writeBigInt64LE(BigInt(claimWindowSeconds), 74);
  return data;
}

function parsePolicy(body) {
  const feeBasisPoints = Number(body?.feeBasisPoints);
  const claimWindowSeconds = Number(body?.claimWindowSeconds);
  if (!Number.isInteger(feeBasisPoints) || feeBasisPoints < 0 || feeBasisPoints > 1000) {
    throw fail('Fee must be an integer from 0 to 1000 basis points');
  }
  if (!Number.isInteger(claimWindowSeconds) || claimWindowSeconds < 1 || claimWindowSeconds > MAX_CLAIM_WINDOW_SECONDS) {
    throw fail(`Claim window must be an integer from 1 to ${MAX_CLAIM_WINDOW_SECONDS} seconds`);
  }
  return { feeBasisPoints, claimWindowSeconds };
}

function parseMarketDraft(body) {
  const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const category = typeof body?.category === 'string' ? body.category.trim().toUpperCase() : 'DEVNET';
  const lockTime = Number(body?.lockTime);
  if (!/^[a-z0-9][a-z0-9:_-]{2,95}$/i.test(matchId)) throw fail('Match ID must be 3-96 letters, numbers, colons, underscores, or hyphens');
  if (title.length < 3 || title.length > 120) throw fail('Match title must be 3-120 characters');
  if (!/^[A-Z_]{3,32}$/.test(category)) throw fail('Market category must contain capital letters or underscores');
  if (!Number.isInteger(lockTime) || lockTime < Math.floor(Date.now() / 1000) + 300) throw fail('Lock time must be at least five minutes in the future');
  return { matchId, title, category, lockTime };
}

function marketAddresses(config, matchId) {
  const matchHash = require('crypto').createHash('sha256').update(matchId, 'utf8').digest();
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], config.programId);
  const [market] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchHash], config.programId);
  const vault = getAssociatedTokenAddressSync(config.acceptedMint, market, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  return { configPda, matchHash, market, vault };
}

function marketData(matchHash, lockTime) {
  const data = Buffer.alloc(48);
  Buffer.from(CREATE_MARKET.discriminator).copy(data, 0);
  matchHash.copy(data, 8);
  data.writeBigInt64LE(BigInt(lockTime), 40);
  return data;
}

async function prepareMarket(config, body) {
  const draft = parseMarketDraft(body);
  const rpc = connection(config);
  const { configPda, matchHash, market, vault } = marketAddresses(config, draft.matchId);
  if (await rpc.getAccountInfo(market, 'confirmed')) throw fail('A market already exists for this canonical match ID', 409);
  const latest = await rpc.getLatestBlockhash('confirmed');
  const transaction = new Transaction();
  transaction.feePayer = config.platformAuthority;
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
  transaction.add(new TransactionInstruction({
    programId: config.programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: config.acceptedMint, isSigner: false, isWritable: false },
      { pubkey: config.platformAuthority, isSigner: true, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: marketData(matchHash, draft.lockTime),
  }));
  const transactionText = serializeTransaction(transaction);
  const draftId = require('crypto').createHash('sha256').update(transaction.serializeMessage()).digest('hex');
  marketDrafts.set(draftId, { ...draft, market: market.toBase58(), vault: vault.toBase58(), configPda: configPda.toBase58() });
  return { transaction: transactionText, draftId, review: { cluster: 'devnet', ...marketDrafts.get(draftId), lockTime: draft.lockTime } };
}

function assertExactMarketTransaction(transaction, config, draft) {
  const { configPda, matchHash, market, vault } = marketAddresses(config, draft.matchId);
  const appInstructions = transaction.instructions.filter((ix) => !ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID));
  if (appInstructions.length !== 1) throw fail('Rejected: transaction must contain exactly one Feras market instruction', 409);
  const instruction = appInstructions[0];
  if (!transaction.feePayer?.equals(config.platformAuthority)) {
    throw fail('Rejected: fee payer must be the platform authority', 409);
  }
  if (!instruction.programId.equals(config.programId)) {
    throw fail('Rejected: instruction program ID mismatch', 409);
  }
  if (!instruction.data.equals(marketData(matchHash, draft.lockTime))) {
    throw fail('Rejected: instruction data mismatch', 409);
  }
  const expectedPubkeys = [configPda, market, vault, config.acceptedMint, config.platformAuthority, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId];
  if (instruction.keys.length !== expectedPubkeys.length || !instruction.keys.every((k, i) => k.pubkey.equals(expectedPubkeys[i]))) {
    throw fail('Rejected: transaction keys do not match canonical market creation accounts', 409);
  }
}

function marketRegistry() {
  const file = path.join(ROOT, 'config/devnet-markets.json');
  let registry = [];
  if (fs.existsSync(file)) registry = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(registry)) throw fail('The local market registry is malformed', 500);
  return { file, registry };
}

function recordMarket(draft) {
  const { file, registry } = marketRegistry();
  if (registry.some((entry) => entry.id === draft.matchId)) return;
  registry.push({ id: draft.matchId, title: draft.title, category: draft.category, status: 'OPEN', lockTime: draft.lockTime, marketAddress: draft.market, vaultAddress: draft.vault });
  fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
}

function recordMarketStatus(matchId, status, signature) {
  const { file, registry } = marketRegistry();
  const entry = registry.find((market) => market.id === matchId);
  if (!entry) throw fail('The locally reviewed market is missing from the registry', 409);
  entry.status = status;
  entry[status === 'LOCKED' ? 'lockSignature' : 'createSignature'] = signature;
  fs.writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
  return entry;
}

async function prepareMarketLock(config, body) {
  const matchId = typeof body?.matchId === 'string' ? body.matchId.trim() : '';
  if (!/^[a-z0-9][a-z0-9:_-]{2,95}$/i.test(matchId)) throw fail('A canonical market ID is required');
  const { registry } = marketRegistry();
  const entry = registry.find((market) => market.id === matchId);
  if (!entry) throw fail('Create and confirm this market locally before preparing its lock transaction', 409);
  if (entry.status === 'LOCKED') throw fail('This market is already recorded as locked', 409);
  const lockTime = Number(entry.lockTime);
  if (!Number.isSafeInteger(lockTime)) throw fail('This local market registry lacks a valid lock time', 409);

  const rpc = connection(config);
  const { configPda, market, vault } = marketAddresses(config, matchId);
  if (entry.marketAddress !== market.toBase58() || entry.vaultAddress !== vault.toBase58()) {
    throw fail('The registry market addresses do not match the canonical PDA derivation', 409);
  }
  const [slot, marketAccount] = await Promise.all([
    rpc.getSlot('confirmed'),
    rpc.getAccountInfo(market, 'confirmed'),
  ]);
  const chainTime = await rpc.getBlockTime(slot);
  if (!marketAccount || !marketAccount.owner.equals(config.programId) || marketAccount.data.length < 40 || !marketAccount.data.subarray(8, 40).equals(configPda.toBuffer())) {
    throw fail('The canonical market PDA is not a valid Feras market for this config', 409);
  }
  if (!chainTime || chainTime < lockTime) throw fail(`Market locking opens at ${new Date(lockTime * 1000).toISOString()}`, 409);

  const latest = await rpc.getLatestBlockhash('confirmed');
  const transaction = new Transaction();
  transaction.feePayer = config.platformAuthority;
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
  transaction.add(new TransactionInstruction({
    programId: config.programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: market, isSigner: false, isWritable: true },
      { pubkey: config.platformAuthority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from(LOCK_MARKET.discriminator),
  }));
  const draftId = require('crypto').createHash('sha256').update(transaction.serializeMessage()).digest('hex');
  marketLockDrafts.set(draftId, { matchId, market: market.toBase58(), vault: vault.toBase58(), lockTime, messageHash: draftId });
  return { transaction: serializeTransaction(transaction), draftId, review: { cluster: 'devnet', ...marketLockDrafts.get(draftId), chainTime } };
}

function assertExactMarketLockTransaction(transaction, config, draft) {
  const { configPda, market } = marketAddresses(config, draft.matchId);
  const appInstructions = transaction.instructions.filter((ix) => !ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID));
  if (appInstructions.length !== 1) throw fail('Rejected: transaction must contain exactly one Feras market lock instruction', 409);
  const instruction = appInstructions[0];
  if (!transaction.feePayer?.equals(config.platformAuthority)) {
    throw fail('Rejected: fee payer must be the platform authority', 409);
  }
  if (!instruction.programId.equals(config.programId)) {
    throw fail('Rejected: instruction program ID mismatch', 409);
  }
  if (!instruction.data.equals(Buffer.from(LOCK_MARKET.discriminator))) {
    throw fail('Rejected: instruction discriminator mismatch', 409);
  }
  if (instruction.keys.length !== 3 ||
      !instruction.keys[0].pubkey.equals(configPda) ||
      !instruction.keys[1].pubkey.equals(market) || !instruction.keys[1].isWritable ||
      !instruction.keys[2].pubkey.equals(config.platformAuthority) || !instruction.keys[2].isSigner) {
    throw fail('Rejected: transaction keys do not match canonical market lock accounts', 409);
  }
}

function parseTestUsdc(value) {
  const amount = typeof value === 'string' ? value.trim() : '';
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount)) throw fail('Amount must be a positive Devnet USDC value with at most 6 decimals');
  const [whole, fraction = ''] = amount.split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0') || '0');
  if (units < 1n || units > 10_000n * 1_000_000n) throw fail('Distribution amount must be between 0.000001 and 10,000 Devnet USDC');
  return { display: amount, units };
}

async function prepareDistribution(config, body) {
  const recipient = publicKey(body?.recipient, 'recipient');
  const amount = parseTestUsdc(body?.amount);
  const rpc = connection(config);
  const source = getAssociatedTokenAddressSync(config.acceptedMint, config.distributionAuthority, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const destination = getAssociatedTokenAddressSync(config.acceptedMint, recipient, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const sourceBalance = await rpc.getTokenAccountBalance(source, 'confirmed');
  if (BigInt(sourceBalance.value.amount) < amount.units) throw fail('Distribution account does not have enough Devnet USDC', 409);
  const latest = await rpc.getLatestBlockhash('confirmed');
  const transaction = new Transaction();
  transaction.feePayer = config.distributionAuthority;
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
  if (!await rpc.getAccountInfo(destination, 'confirmed')) transaction.add(createAssociatedTokenAccountInstruction(config.distributionAuthority, destination, recipient, config.acceptedMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID));
  transaction.add(createTransferCheckedInstruction(source, config.acceptedMint, destination, config.distributionAuthority, amount.units, 6, [], TOKEN_PROGRAM_ID));
  const draftId = require('crypto').createHash('sha256').update(transaction.serializeMessage()).digest('hex');
  distributionDrafts.set(draftId, { recipient: recipient.toBase58(), amount: amount.display, source: source.toBase58(), destination: destination.toBase58(), messageHash: draftId });
  return { transaction: serializeTransaction(transaction), draftId, review: { cluster: 'devnet', ...distributionDrafts.get(draftId) } };
}

async function prepareUpgrade(config) {
  const rpc = connection(config);
  const cliAuthority = loadCliAuthority(config);
  const { programData } = deriveAddresses(config);
  const onChainAuthority = await currentUpgradeAuthority(rpc, programData);
  if (!onChainAuthority?.equals(cliAuthority.publicKey)) {
    throw fail('The CLI keypair is not the current on-chain upgrade authority', 409);
  }
  const latest = await rpc.getLatestBlockhash('confirmed');
  const transaction = new Transaction();
  transaction.feePayer = cliAuthority.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
  transaction.add(new TransactionInstruction({
    programId: BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
    keys: [
      { pubkey: programData, isSigner: false, isWritable: true },
      { pubkey: cliAuthority.publicKey, isSigner: true, isWritable: false },
      { pubkey: config.expectedUpgradeAuthority, isSigner: true, isWritable: false },
    ],
    data: SET_AUTHORITY_CHECKED,
  }));
  transaction.partialSign(cliAuthority);
  return {
    transaction: serializeTransaction(transaction),
    review: {
      cluster: 'devnet',
      programId: config.programId.toBase58(),
      programData: programData.toBase58(),
      currentAuthority: cliAuthority.publicKey.toBase58(),
      newAuthority: config.expectedUpgradeAuthority.toBase58(),
      instruction: 'Upgradeable BPF Loader: SetAuthorityChecked',
    },
  };
}

async function prepareInitialize(config, body) {
  const policy = parsePolicy(body);
  const rpc = connection(config);
  const { configPda } = deriveAddresses(config);
  if (await rpc.getAccountInfo(configPda, 'confirmed')) {
    throw fail('The platform config PDA is already initialized; refusing to overwrite it', 409);
  }
  const latest = await rpc.getLatestBlockhash('confirmed');
  const transaction = new Transaction();
  transaction.feePayer = config.platformAuthority;
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
  transaction.add(new TransactionInstruction({
    programId: config.programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: config.platformAuthority, isSigner: true, isWritable: true },
      { pubkey: config.acceptedMint, isSigner: false, isWritable: false },
      { pubkey: config.treasuryTokenAccount, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initializeData(config, policy.feeBasisPoints, policy.claimWindowSeconds),
  }));
  return {
    transaction: serializeTransaction(transaction),
    review: {
      cluster: 'devnet',
      programId: config.programId.toBase58(),
      configPda: configPda.toBase58(),
      platformAuthority: config.platformAuthority.toBase58(),
      settlementAuthority: config.settlementAuthority.toBase58(),
      treasuryAuthority: config.treasuryAuthority.toBase58(),
      acceptedMint: config.acceptedMint.toBase58(),
      treasuryTokenAccount: config.treasuryTokenAccount.toBase58(),
      feeBasisPoints: policy.feeBasisPoints,
      claimWindowSeconds: policy.claimWindowSeconds,
    },
  };
}

function assertExactInitializeTransaction(transaction, config) {
  const { configPda } = deriveAddresses(config);
  if (!transaction.feePayer?.equals(config.platformAuthority) || transaction.instructions.length !== 1) {
    throw fail('Rejected: transaction shape differs from the reviewed config initialization', 409);
  }
  const instruction = transaction.instructions[0];
  const expectedKeys = [
    { pubkey: configPda, isSigner: false, isWritable: true },
    { pubkey: config.platformAuthority, isSigner: true, isWritable: true },
    { pubkey: config.acceptedMint, isSigner: false, isWritable: false },
    { pubkey: config.treasuryTokenAccount, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  const args = readInitializeArgs(instruction.data);
  if (!instruction.programId.equals(config.programId) || !accountMetaMatches(instruction, expectedKeys) ||
      !args || !args.settlementAuthority.equals(config.settlementAuthority) ||
      !args.treasuryAuthority.equals(config.treasuryAuthority) ||
      args.feeBasisPoints > 1000 || args.claimWindowSeconds < 1 || args.claimWindowSeconds > MAX_CLAIM_WINDOW_SECONDS) {
    throw fail('Rejected: transaction does not exactly match the reviewed config initialization', 409);
  }
}

async function submitTransaction(config, encoded, operation, draftId) {
  const rpc = connection(config);
  const transaction = decodeTransaction(encoded);
  if (operation === 'upgrade') {
    const cliAuthority = loadCliAuthority(config);
    assertExactUpgradeTransaction(transaction, config, cliAuthority);
    const newAuthoritySignature = transaction.signatures.find((entry) =>
      entry.publicKey.equals(config.expectedUpgradeAuthority),
    )?.signature;
    if (!newAuthoritySignature || !ed25519.verify(
      newAuthoritySignature,
      transaction.serializeMessage(),
      config.expectedUpgradeAuthority.toBytes(),
    )) {
      throw fail('Rejected: the required new upgrade-authority signature is missing or invalid', 409);
    }
    // Some extension providers return a transaction containing only their own
    // signature. Reapply the local signer only after the complete message and
    // the extension signature have both been verified above.
    transaction.partialSign(cliAuthority);
  } else if (operation === 'market') {
    const draft = marketDrafts.get(draftId || '');
    if (!draft) throw fail('The reviewed market draft expired; prepare it again', 409);
    assertExactMarketTransaction(transaction, config, draft);
  } else if (operation === 'market-lock') {
    const draft = marketLockDrafts.get(draftId || '');
    if (!draft) throw fail('The reviewed market-lock draft expired; prepare it again', 409);
    assertExactMarketLockTransaction(transaction, config, draft);
  } else if (operation === 'distribution') {
    const draft = distributionDrafts.get(draftId || '');
    if (!draft || require('crypto').createHash('sha256').update(transaction.serializeMessage()).digest('hex') !== draft.messageHash) throw fail('Rejected: transaction differs from the reviewed distribution draft', 409);
    const signature = transaction.signatures.find((entry) => entry.publicKey.equals(config.distributionAuthority))?.signature;
    if (!signature || !ed25519.verify(signature, transaction.serializeMessage(), config.distributionAuthority.toBytes())) throw fail('Rejected: distribution-authority signature is missing or invalid', 409);
  } else {
    assertExactInitializeTransaction(transaction, config);
    const { configPda } = deriveAddresses(config);
    if (await rpc.getAccountInfo(configPda, 'confirmed')) throw fail('Config PDA is already initialized', 409);
  }
  if (!transaction.verifySignatures()) throw fail('Rejected: one or more required transaction signatures are invalid', 409);
  const signature = await rpc.sendRawTransaction(transaction.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed' });
  // `lastValidBlockHeight` is not serialized in a legacy transaction. The
  // signed browser payload therefore cannot reliably provide it back here.
  const confirmation = await rpc.confirmTransaction(signature, 'confirmed');
  if (confirmation.value.err) throw fail(`Devnet rejected the transaction: ${JSON.stringify(confirmation.value.err)}`, 409);
  if (operation === 'market') {
    const draft = marketDrafts.get(draftId);
    recordMarket(draft);
    recordMarketStatus(draft.matchId, 'OPEN', signature);
  }
  if (operation === 'market-lock') recordMarketStatus(marketLockDrafts.get(draftId).matchId, 'LOCKED', signature);
  return { signature };
}

async function status(config) {
  const rpc = connection(config);
  const { programData, configPda } = deriveAddresses(config);
  const [upgradeAuthority, configAccount] = await Promise.all([
    currentUpgradeAuthority(rpc, programData),
    rpc.getAccountInfo(configPda, 'confirmed'),
  ]);
  return {
    cluster: 'devnet',
    programId: config.programId.toBase58(),
    programData: programData.toBase58(),
    currentUpgradeAuthority: upgradeAuthority?.toBase58() || null,
    expectedUpgradeAuthority: config.expectedUpgradeAuthority.toBase58(),
    configPda: configPda.toBase58(),
    configInitialized: Boolean(configAccount),
    platformAuthority: config.platformAuthority.toBase58(),
  };
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) reject(fail('Request body is too large', 413));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(fail('Invalid JSON request body')); }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const config = localConfig();
    if (request.method === 'GET' && request.url === '/api/status') return sendJson(response, 200, await status(config));
    if (request.method === 'GET' && request.url === '/api/markets') return sendJson(response, 200, marketRegistry().registry);
    if (request.method === 'POST' && request.url === '/api/upgrade/prepare') return sendJson(response, 200, await prepareUpgrade(config));
    if (request.method === 'POST' && request.url === '/api/upgrade/submit') return sendJson(response, 200, await submitTransaction(config, (await readJson(request)).transaction, 'upgrade'));
    if (request.method === 'POST' && request.url === '/api/config/prepare') return sendJson(response, 200, await prepareInitialize(config, await readJson(request)));
    if (request.method === 'POST' && request.url === '/api/config/submit') return sendJson(response, 200, await submitTransaction(config, (await readJson(request)).transaction, 'config'));
    if (request.method === 'POST' && request.url === '/api/market/prepare') return sendJson(response, 200, await prepareMarket(config, await readJson(request)));
    if (request.method === 'POST' && request.url === '/api/market/submit') { const body = await readJson(request); return sendJson(response, 200, await submitTransaction(config, body.transaction, 'market', body.draftId)); }
    if (request.method === 'POST' && request.url === '/api/market/lock/prepare') return sendJson(response, 200, await prepareMarketLock(config, await readJson(request)));
    if (request.method === 'POST' && request.url === '/api/market/lock/submit') { const body = await readJson(request); return sendJson(response, 200, await submitTransaction(config, body.transaction, 'market-lock', body.draftId)); }
    if (request.method === 'POST' && request.url === '/api/distribution/prepare') return sendJson(response, 200, await prepareDistribution(config, await readJson(request)));
    if (request.method === 'POST' && request.url === '/api/distribution/submit') { const body = await readJson(request); return sendJson(response, 200, await submitTransaction(config, body.transaction, 'distribution', body.draftId)); }
    if (request.method === 'GET' && (request.url === '/' || request.url === '/index.html')) {
      const nonce = randomBytes(16).toString('base64');
      const body = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace('{{CSP_NONCE}}', nonce);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': `default-src 'self' https://esm.sh; connect-src 'self' https://esm.sh; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}' https://esm.sh` });
      return response.end(body);
    }
    sendJson(response, 404, { error: 'Not found' });
  } catch (error) {
    process.stderr.write(`[Admin API Error] ${error.status || 500}: ${error.stack || error.message}\n`);
    sendJson(response, error.status || 500, { error: error.message || 'Unexpected server error' });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Feras Admin is listening only on http://${HOST}:${PORT}\n`);
});
