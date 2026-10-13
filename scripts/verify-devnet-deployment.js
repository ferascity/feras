#!/usr/bin/env node

const { web3 } = require('@coral-xyz/anchor');
const { getAccount, getMint, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { buildManifest } = require('./validate-devnet-release-config');

const { Connection, PublicKey } = web3;
const RPC_URL = process.env.FERAS_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const CONFIG_DISCRIMINATOR = Buffer.from([160, 78, 128, 0, 248, 83, 230, 160]);

function keyAt(data, offset) {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function fail(message) {
  throw new Error(`Devnet deployment verification failed: ${message}`);
}

async function verifyDeployment(environment = process.env) {
  const manifest = buildManifest(environment);
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(manifest.program.id);
  const mintAddress = new PublicKey(manifest.token.mint);
  const configAddress = new PublicKey(manifest.program.configPda);
  const treasuryAddress = new PublicKey(manifest.treasuryTokenAccount);

  const program = await connection.getAccountInfo(programId, 'confirmed');
  if (!program?.executable) fail('program account is missing or not executable');

  const mint = await getMint(connection, mintAddress, 'confirmed', TOKEN_PROGRAM_ID);
  if (mint.decimals !== manifest.token.decimals) fail('mint decimals differ from the six-decimal manifest');
  if (mint.mintAuthority !== null) fail('mint authority has not been revoked');
  if (mint.freezeAuthority !== null) fail('mint freeze authority must be null');
  if (mint.supply !== BigInt(manifest.token.supplyCapBaseUnits)) fail('mint supply differs from the fixed manifest cap');

  const treasury = await getAccount(connection, treasuryAddress, 'confirmed', TOKEN_PROGRAM_ID);
  if (!treasury.mint.equals(mintAddress)) fail('treasury token account uses the wrong mint');
  if (treasury.owner.toBase58() !== manifest.authorities.treasury) fail('treasury token account owner differs from the manifest');

  const config = await connection.getAccountInfo(configAddress, 'confirmed');
  if (!config?.owner.equals(programId)) fail('config PDA is absent or owned by another program');
  if (!config.data.subarray(0, 8).equals(CONFIG_DISCRIMINATOR) || config.data.length < 220) {
    fail('config PDA does not match the expected Feras account layout');
  }
  if (keyAt(config.data, 8) !== manifest.authorities.platform) fail('platform authority mismatch');
  if (keyAt(config.data, 72) !== manifest.authorities.settlement) fail('settlement authority mismatch');
  if (keyAt(config.data, 104) !== manifest.authorities.treasury) fail('treasury authority mismatch');
  if (keyAt(config.data, 136) !== manifest.token.mint) fail('accepted mint mismatch');
  if (keyAt(config.data, 168) !== manifest.treasuryTokenAccount) fail('treasury token account mismatch');

  return {
    cluster: 'devnet',
    rpcUrl: RPC_URL,
    programId: manifest.program.id,
    configPda: manifest.program.configPda,
    mint: manifest.token.mint,
    treasury: manifest.treasuryTokenAccount,
    verifiedAt: new Date().toISOString(),
  };
}

if (require.main === module) {
  verifyDeployment()
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { verifyDeployment };
