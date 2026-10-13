#!/usr/bin/env node

const { web3 } = require('@coral-xyz/anchor');
const {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} = require('@solana/spl-token');

const { PublicKey } = web3;

const CONFIG_SEED = Buffer.from('config');
const TOKEN_DECIMALS = 6;
const MAX_MINT_CAP_BASE_UNITS = 10_000_000n * 10n ** BigInt(TOKEN_DECIMALS);

const authorityFields = [
  'FERAS_UPGRADE_AUTHORITY',
  'FERAS_PLATFORM_AUTHORITY',
  'FERAS_SETTLEMENT_AUTHORITY',
  'FERAS_TREASURY_AUTHORITY',
  'FERAS_MINT_AUTHORITY',
  'FERAS_DISTRIBUTION_AUTHORITY',
];

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function publicKey(environment, name) {
  const value = required(environment, name);
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${name} must be a valid Solana public key`);
  }
}

function parseTokenAmount(value, decimals = TOKEN_DECIMALS) {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
    throw new Error('FERAS_DEVNET_MINT_CAP must be a positive decimal string');
  }

  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) {
    throw new Error(`FERAS_DEVNET_MINT_CAP supports at most ${decimals} decimals`);
  }

  const units =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction || '').padEnd(decimals, '0') || '0');
  if (units === 0n) {
    throw new Error('FERAS_DEVNET_MINT_CAP must be greater than zero');
  }
  if (units > MAX_MINT_CAP_BASE_UNITS) {
    throw new Error('FERAS_DEVNET_MINT_CAP exceeds the 10,000,000 token policy cap');
  }
  return units;
}

function validateDistinctAuthorities(authorities) {
  const byAddress = new Map();
  for (const [role, address] of Object.entries(authorities)) {
    const existingRole = byAddress.get(address);
    if (existingRole) {
      throw new Error(`${role} must be distinct from ${existingRole}`);
    }
    byAddress.set(address, role);
  }
}

function buildManifest(environment) {
  const programId = publicKey(environment, 'FERAS_PROGRAM_ID');
  const mint = publicKey(environment, 'FERAS_DEVNET_USDC_MINT');
  const parsedAuthorities = Object.fromEntries(
    authorityFields.map((name) => [name, publicKey(environment, name)]),
  );
  const authorities = Object.fromEntries(
    Object.entries(parsedAuthorities).map(([name, key]) => [name, key.toBase58()]),
  );
  validateDistinctAuthorities(authorities);

  const mintCap = required(environment, 'FERAS_DEVNET_MINT_CAP');
  const mintCapBaseUnits = parseTokenAmount(mintCap);
  const treasuryAuthority = parsedAuthorities.FERAS_TREASURY_AUTHORITY;
  const expectedTreasury = getAssociatedTokenAddressSync(
    mint,
    treasuryAuthority,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const expectedDistributionVault = getAssociatedTokenAddressSync(
    mint,
    parsedAuthorities.FERAS_DISTRIBUTION_AUTHORITY,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  const configuredTreasury = environment.FERAS_TREASURY_TOKEN_ACCOUNT?.trim();
  if (configuredTreasury) {
    const treasury = publicKey(environment, 'FERAS_TREASURY_TOKEN_ACCOUNT');
    if (!treasury.equals(expectedTreasury)) {
      throw new Error(
        `FERAS_TREASURY_TOKEN_ACCOUNT must equal the derived ATA ${expectedTreasury.toBase58()}`,
      );
    }
  }

  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
  return {
    schemaVersion: 1,
    cluster: 'devnet',
    program: {
      id: programId.toBase58(),
      configPda: configPda.toBase58(),
      upgradeAuthority: authorities.FERAS_UPGRADE_AUTHORITY,
    },
    token: {
      displayName: 'Devnet USDC',
      valueless: true,
      programId: TOKEN_PROGRAM_ID.toBase58(),
      mint: mint.toBase58(),
      decimals: TOKEN_DECIMALS,
      creationMintAuthority: authorities.FERAS_MINT_AUTHORITY,
      expectedFinalMintAuthority: null,
      freezeAuthority: null,
      fixedSupply: true,
      supplyCap: mintCap,
      supplyCapBaseUnits: mintCapBaseUnits.toString(),
      distributionAuthority: authorities.FERAS_DISTRIBUTION_AUTHORITY,
      distributionTokenAccount: expectedDistributionVault.toBase58(),
    },
    authorities: {
      platform: authorities.FERAS_PLATFORM_AUTHORITY,
      settlement: authorities.FERAS_SETTLEMENT_AUTHORITY,
      treasury: authorities.FERAS_TREASURY_AUTHORITY,
    },
    treasuryTokenAccount: expectedTreasury.toBase58(),
  };
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(buildManifest(process.env), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Invalid devnet release configuration: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  MAX_MINT_CAP_BASE_UNITS,
  TOKEN_DECIMALS,
  buildManifest,
  parseTokenAmount,
};
