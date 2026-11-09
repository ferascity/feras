#!/usr/bin/env node

/*
 * Completes a pending platform-authority transfer. The current authority must
 * have already signed `propose_authority` (the admin console does that in the
 * browser). This script signs `accept_authority` with the automation keypair
 * that was proposed, so CREATE/LOCK can run without a browser afterwards.
 */
const fs = require('node:fs');
const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} = require('@solana/web3.js');

// Anchor discriminator for feras_market::accept_authority.
const ACCEPT_AUTHORITY_DISCRIMINATOR = Buffer.from([107, 86, 198, 91, 33, 12, 107, 160]);
const CONFIG_SEED = Buffer.from('config');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadKeypair(file) {
  const secret = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(secret)) throw new Error(`${file} is not a JSON secret-key array`);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main() {
  const keypairPath = process.env.FERAS_AUTOMATION_PLATFORM_KEYPAIR_PATH?.trim() || '/run/secrets/feras-platform.json';
  const pendingAuthority = loadKeypair(keypairPath);
  const programId = new PublicKey(required('FERAS_PROGRAM_ID'));
  const rpc = new Connection(required('FERAS_SOLANA_RPC_URL'), 'confirmed');
  const [configPda] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

  const before = await rpc.getAccountInfo(configPda, 'confirmed');
  if (!before || !before.owner.equals(programId) || before.data.length < 72) {
    throw new Error('The platform config PDA is missing or has an unexpected layout');
  }
  const currentAuthority = new PublicKey(before.data.subarray(8, 40));
  const pendingOnChain = new PublicKey(before.data.subarray(40, 72));
  if (!pendingOnChain.equals(pendingAuthority.publicKey)) {
    throw new Error(
      `On-chain pending authority is ${pendingOnChain.toBase58()}, but ${keypairPath} is ${pendingAuthority.publicKey.toBase58()}. ` +
        'Propose this key from the admin console first.',
    );
  }
  if (pendingOnChain.equals(PublicKey.default)) {
    throw new Error('There is no pending authority to accept');
  }

  const latest = await rpc.getLatestBlockhash('confirmed');
  const transaction = new Transaction();
  transaction.feePayer = pendingAuthority.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
  transaction.add(new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: pendingAuthority.publicKey, isSigner: true, isWritable: false },
    ],
    data: ACCEPT_AUTHORITY_DISCRIMINATOR,
  }));
  transaction.sign(pendingAuthority);

  const signature = await rpc.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  const confirmation = await rpc.confirmTransaction(signature, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(`Devnet rejected accept_authority: ${JSON.stringify(confirmation.value.err)}`);
  }

  const after = await rpc.getAccountInfo(configPda, 'confirmed');
  const acceptedAuthority = new PublicKey(after.data.subarray(8, 40));
  const pendingAfter = new PublicKey(after.data.subarray(40, 72));
  if (!acceptedAuthority.equals(pendingAuthority.publicKey) || !pendingAfter.equals(PublicKey.default)) {
    throw new Error('The transaction confirmed but the on-chain config was not updated as expected');
  }

  process.stdout.write([
    `Platform authority transferred.`,
    `Previous: ${currentAuthority.toBase58()}`,
    `Current:  ${acceptedAuthority.toBase58()}`,
    `Signature: ${signature}`,
  ].join('\n') + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
