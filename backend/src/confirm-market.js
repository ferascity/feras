#!/usr/bin/env node
const crypto = require('node:crypto');
const { Connection, PublicKey } = require('@solana/web3.js');
const { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');
const { MatchRepository } = require('./repository');

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const id = option('id');
  const marketAddress = option('market');
  const vaultAddress = option('vault');
  const signature = option('signature');
  const command = option('command');
  if (!id || !marketAddress || !vaultAddress || !signature || !['CREATE', 'LOCK'].includes(command || '')) {
    throw new Error('Usage: confirm-market.js --id <match-id> --market <market-pda> --vault <vault-ata> --signature <devnet-signature> --command CREATE|LOCK');
  }

  const programId = new PublicKey(required('FERAS_PROGRAM_ID'));
  const mint = new PublicKey(required('FERAS_DEVNET_USDC_MINT'));
  const matchHash = crypto.createHash('sha256').update(id, 'utf8').digest();
  const [expectedMarket] = PublicKey.findProgramAddressSync([Buffer.from('market'), matchHash], programId);
  const expectedVault = getAssociatedTokenAddressSync(mint, expectedMarket, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  if (marketAddress !== expectedMarket.toBase58() || vaultAddress !== expectedVault.toBase58()) {
    throw new Error('Market or vault does not match the canonical PDA derivation for this match ID');
  }

  const rpc = new Connection(required('FERAS_SOLANA_RPC_URL'), 'confirmed');
  const [status, marketAccount, vaultAccount] = await Promise.all([
    rpc.getSignatureStatus(signature, { searchTransactionHistory: true }),
    rpc.getAccountInfo(expectedMarket, 'confirmed'),
    rpc.getParsedAccountInfo(expectedVault, 'confirmed'),
  ]);
  if (!status.value || status.value.err || !['confirmed', 'finalized'].includes(status.value.confirmationStatus || '')) {
    throw new Error('The supplied Devnet transaction is not confirmed successfully');
  }
  if (!marketAccount?.owner.equals(programId)) throw new Error('The derived market PDA is not owned by the Feras program');
  const parsedVault = vaultAccount.value?.data;
  if (!('parsed' in (parsedVault || {})) || parsedVault.parsed?.info?.mint !== mint.toBase58()) {
    throw new Error('The derived vault is not a token account for the configured Devnet USDC mint');
  }

  const repository = new MatchRepository(required('FERAS_DATABASE_URL'));
  try {
    const match = await repository.getMatch(id);
    if (!match) throw new Error(`Backend match ${id} does not exist`);
    if (command === 'CREATE') await repository.attachMarket(id, { marketAddress, vaultAddress });
    await repository.confirmMarketCommand(id, command, signature);
  } finally {
    await repository.close();
  }
  process.stdout.write(`Confirmed ${command} for ${id}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
