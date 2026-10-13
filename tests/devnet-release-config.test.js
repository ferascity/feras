const assert = require('node:assert/strict');
const { test } = require('node:test');
const { web3 } = require('@coral-xyz/anchor');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');

const { Keypair, PublicKey } = web3;

const {
  buildManifest,
  parseTokenAmount,
} = require('../scripts/validate-devnet-release-config');

function address() {
  return Keypair.generate().publicKey.toBase58();
}

function validEnvironment() {
  return {
    FERAS_PROGRAM_ID: address(),
    FERAS_DEVNET_USDC_MINT: address(),
    FERAS_UPGRADE_AUTHORITY: address(),
    FERAS_PLATFORM_AUTHORITY: address(),
    FERAS_SETTLEMENT_AUTHORITY: address(),
    FERAS_TREASURY_AUTHORITY: address(),
    FERAS_MINT_AUTHORITY: address(),
    FERAS_DISTRIBUTION_AUTHORITY: address(),
    FERAS_DEVNET_MINT_CAP: '1000000',
  };
}

test('parses six-decimal token amounts without floating point', () => {
  assert.equal(parseTokenAmount('1'), 1_000_000n);
  assert.equal(parseTokenAmount('1.000001'), 1_000_001n);
  assert.throws(() => parseTokenAmount('0'), /greater than zero/);
  assert.throws(() => parseTokenAmount('1.0000001'), /at most 6 decimals/);
  assert.throws(() => parseTokenAmount('10000000.000001'), /policy cap/);
});

test('builds a devnet manifest with canonical PDAs and ATA', () => {
  const environment = validEnvironment();
  const manifest = buildManifest(environment);
  const expectedTreasury = getAssociatedTokenAddressSync(
    new PublicKey(environment.FERAS_DEVNET_USDC_MINT),
    new PublicKey(environment.FERAS_TREASURY_AUTHORITY),
    true,
  );

  assert.equal(manifest.cluster, 'devnet');
  assert.equal(manifest.token.decimals, 6);
  assert.equal(manifest.token.valueless, true);
  assert.equal(manifest.token.freezeAuthority, null);
  assert.equal(manifest.token.expectedFinalMintAuthority, null);
  assert.equal(manifest.token.fixedSupply, true);
  assert.equal(manifest.token.supplyCapBaseUnits, '1000000000000');
  assert.equal(manifest.treasuryTokenAccount, expectedTreasury.toBase58());
});

test('rejects shared authorities and a redirected treasury account', () => {
  const shared = validEnvironment();
  shared.FERAS_SETTLEMENT_AUTHORITY = shared.FERAS_PLATFORM_AUTHORITY;
  assert.throws(() => buildManifest(shared), /must be distinct/);

  const redirected = validEnvironment();
  redirected.FERAS_TREASURY_TOKEN_ACCOUNT = address();
  assert.throws(() => buildManifest(redirected), /must equal the derived ATA/);
});
