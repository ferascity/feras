const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { Keypair, PublicKey, SystemProgram, Transaction } = require('@coral-xyz/anchor').web3;
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} = require('@solana/spl-token');
const {
  buildClaimMessage,
  buildSwapMessage,
  normalizeCode,
  solToLamports,
  usdcToBaseUnits,
  usdcToLamports,
  verifySwapTransaction,
  verifyWalletSignature,
} = require('../backend/src/beta');

function testKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  // SPKI wraps the raw 32-byte key after a fixed 12-byte prefix.
  return { privateKey, address: new PublicKey(der.subarray(12)).toBase58() };
}

function encodeSignature(transaction) {
  const loaded = require('bs58');
  const bs58 = loaded.default ?? loaded;
  return bs58.encode(transaction.signatures[0].signature);
}

test('claim messages normalise the invite code and bind wallet, code, and timestamp', () => {
  const message = buildClaimMessage({
    wallet: 'GkuWk8sLYWsquzUK2bh1uTzhgZMa6YT1R3H7xAbBFYhA',
    code: ' feras-beta-7k2m ',
    issuedAt: 1_760_000_000_000,
  });
  assert.equal(
    message,
    'feras-beta-claim:v1:GkuWk8sLYWsquzUK2bh1uTzhgZMa6YT1R3H7xAbBFYhA:FERAS-BETA-7K2M:1760000000000',
  );
  assert.equal(normalizeCode(' feras-beta-7k2m '), 'FERAS-BETA-7K2M');
});

test('wallet signature verification accepts a matching signature and rejects tampering', () => {
  const { privateKey, address } = testKeypair();
  const message = buildClaimMessage({ wallet: address, code: 'FERAS-BETA-AAAA', issuedAt: 1 });
  const signature = sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');

  assert.equal(
    verifyWalletSignature({ message, signature, publicKey: new PublicKey(address) }),
    true,
  );
  assert.equal(
    verifyWalletSignature({
      message: `${message}-tampered`,
      signature,
      publicKey: new PublicKey(address),
    }),
    false,
  );
  assert.equal(
    verifyWalletSignature({ message, signature: 'not-base64', publicKey: new PublicKey(address) }),
    false,
  );
});

test('starter amounts convert to base units without floating point drift', () => {
  assert.equal(solToLamports(0.25), 250_000_000);
  assert.equal(solToLamports(1), 1_000_000_000);
  assert.equal(usdcToBaseUnits(25), 25_000_000n);
  assert.equal(usdcToBaseUnits(0.000001), 1n);
  assert.equal(usdcToBaseUnits(12.5), 12_500_000n);
});

test('swap messages bind the wallet, base units, and timestamp', () => {
  assert.equal(
    buildSwapMessage({
      wallet: 'GkuWk8sLYWsquzUK2bh1uTzhgZMa6YT1R3H7xAbBFYhA',
      usdcBaseUnits: '5000000',
      issuedAt: 1_760_000_000_000,
    }),
    'feras-beta-swap:v1:GkuWk8sLYWsquzUK2bh1uTzhgZMa6YT1R3H7xAbBFYhA:5000000:1760000000000',
  );
});

test('top-up SOL prices round up at the fixed beta rate', () => {
  // 1 SOL = 150 test-USDC, so 5 USDC costs 0.033334 SOL (rounded up).
  assert.equal(usdcToLamports(usdcToBaseUnits(5), 150), 33_333_334n);
  assert.equal(usdcToLamports(usdcToBaseUnits(150), 150), 1_000_000_000n);
  assert.equal(usdcToLamports(usdcToBaseUnits(0.01), 150), 66_667n);
  // The float never loses value to truncation.
  for (const usdc of [5, 10, 25, 99.99]) {
    const lamports = usdcToLamports(usdcToBaseUnits(usdc), 150);
    assert.ok(lamports * 150n >= usdcToBaseUnits(usdc) * 1000n);
  }
});

function buildSwapTransaction({ wallet, treasury, mint, usdcUnits, lamports }) {
  const treasuryAta = getAssociatedTokenAddressSync(
    mint, treasury.publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const walletAta = getAssociatedTokenAddressSync(
    mint, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const transaction = new Transaction();
  transaction.feePayer = wallet.publicKey;
  transaction.recentBlockhash = Keypair.generate().publicKey.toBase58();
  transaction.add(SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: treasury.publicKey,
    lamports,
  }));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(
    wallet.publicKey,
    walletAta,
    wallet.publicKey,
    mint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  ));
  transaction.add(createTransferCheckedInstruction(
    treasuryAta,
    mint,
    walletAta,
    treasury.publicKey,
    usdcUnits,
    6,
    [],
    TOKEN_PROGRAM_ID,
  ));
  transaction.partialSign(wallet);
  return { transaction, treasuryAta, walletAta };
}

test('the prepared top-up transaction passes instruction verification', () => {
  const wallet = Keypair.generate();
  const treasury = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const usdcUnits = usdcToBaseUnits(5);
  const lamports = usdcToLamports(usdcUnits, 150);
  const { transaction, treasuryAta, walletAta } = buildSwapTransaction({
    wallet, treasury, mint, usdcUnits, lamports: Number(lamports),
  });

  const verified = verifySwapTransaction({
    serialized: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
    walletKey: wallet.publicKey,
    mintKey: mint,
    treasuryKey: treasury.publicKey,
    treasuryAta,
    walletAta,
    lamports,
    usdcUnits,
  });
  assert.equal(verified.signature, encodeSignature(transaction));
  // The float can now complete the transaction.
  verified.transaction.partialSign(treasury);
  assert.doesNotThrow(() => verified.transaction.serialize());
});

test('the verifier rejects a transaction that pays a different amount', () => {
  const wallet = Keypair.generate();
  const treasury = Keypair.generate();
  const mint = Keypair.generate().publicKey;
  const usdcUnits = usdcToBaseUnits(5);
  const { transaction, treasuryAta, walletAta } = buildSwapTransaction({
    wallet, treasury, mint, usdcUnits, lamports: 1000,
  });

  assert.throws(
    () => verifySwapTransaction({
      serialized: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
      walletKey: wallet.publicKey,
      mintKey: mint,
      treasuryKey: treasury.publicKey,
      treasuryAta,
      walletAta,
      lamports: usdcToLamports(usdcUnits, 150),
      usdcUnits,
    }),
    /wrong SOL amount/,
  );
});
