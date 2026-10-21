const crypto = require('node:crypto');
const fs = require('node:fs');
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require('@coral-xyz/anchor').web3;
const { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = require('@solana/spl-token');

const CONFIG_SEED = Buffer.from('config');
const MARKET_SEED = Buffer.from('market');
const discriminator = (name) => crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const u64 = (value) => { const out = Buffer.alloc(8); out.writeBigUInt64LE(BigInt(value)); return out; };
const outcome = (result) => ({ '1-0': 0, '1/2-1/2': 1, '0-1': 2 }[result]);

function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required for automated market signing`); return value; }
function loadKeypair(path, name) {
  if (!path) throw new Error(`${name} is not configured`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, 'utf8'))));
}

class DevnetMarketSigner {
  constructor({ repository }) {
    this.repository = repository;
    this.connection = new Connection(required('FERAS_SOLANA_RPC_URL'), 'confirmed');
    this.programId = new PublicKey(required('FERAS_PROGRAM_ID'));
    this.mint = new PublicKey(required('FERAS_DEVNET_USDC_MINT'));
    this.treasury = new PublicKey(required('FERAS_TREASURY_TOKEN_ACCOUNT'));
    this.platform = loadKeypair(process.env.FERAS_AUTOMATION_PLATFORM_KEYPAIR_PATH, 'FERAS_AUTOMATION_PLATFORM_KEYPAIR_PATH');
    this.settlement = loadKeypair(process.env.FERAS_AUTOMATION_SETTLEMENT_KEYPAIR_PATH, 'FERAS_AUTOMATION_SETTLEMENT_KEYPAIR_PATH');
    if (!this.platform.publicKey.equals(new PublicKey(required('FERAS_PLATFORM_AUTHORITY'))) || !this.settlement.publicKey.equals(new PublicKey(required('FERAS_SETTLEMENT_AUTHORITY')))) throw new Error('Automation signer addresses do not match configured Devnet authorities');
  }

  addresses(matchId) {
    const matchHash = crypto.createHash('sha256').update(matchId, 'utf8').digest();
    const [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], this.programId);
    const [market] = PublicKey.findProgramAddressSync([MARKET_SEED, matchHash], this.programId);
    const vault = getAssociatedTokenAddressSync(this.mint, market, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    return { config, matchHash, market, vault };
  }

  async submit(command) {
    const match = await this.repository.getMatch(command.match_id);
    if (!match) throw new Error('Market command references a missing match');
    const { transaction, signer, attachedMarket } = this.build(command, match);
    const latest = await this.connection.getLatestBlockhash('confirmed');
    transaction.feePayer = signer.publicKey;
    transaction.recentBlockhash = latest.blockhash;
    transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
    transaction.sign(signer);
    const simulation = await this.connection.simulateTransaction(transaction, [signer]);
    if (simulation.value.err) throw new Error(`Devnet simulation failed: ${JSON.stringify(simulation.value.err)}`);
    const signature = await this.connection.sendRawTransaction(transaction.serialize());
    await this.connection.confirmTransaction({ signature, ...latest }, 'confirmed');
    if (attachedMarket) await this.repository.attachMarket(match.id, attachedMarket);
    return { status: 'CONFIRMED', signature };
  }

  build(command, match) {
    const addresses = this.addresses(match.id);
    if (command.command_type === 'CREATE') {
      const data = Buffer.concat([discriminator('create_market'), addresses.matchHash, u64(Math.floor(new Date(match.market_lock_time).getTime() / 1000))]);
      return { signer: this.platform, attachedMarket: { marketAddress: addresses.market.toBase58(), vaultAddress: addresses.vault.toBase58() }, transaction: new Transaction().add(new TransactionInstruction({ programId: this.programId, keys: [
        { pubkey: addresses.config, isSigner: false, isWritable: true }, { pubkey: addresses.market, isSigner: false, isWritable: true }, { pubkey: addresses.vault, isSigner: false, isWritable: true }, { pubkey: this.mint, isSigner: false, isWritable: false }, { pubkey: this.platform.publicKey, isSigner: true, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ], data })) };
    }
    if (command.command_type === 'LOCK') return { signer: this.platform, transaction: new Transaction().add(new TransactionInstruction({ programId: this.programId, keys: [{ pubkey: addresses.config, isSigner: false, isWritable: false }, { pubkey: addresses.market, isSigner: false, isWritable: true }, { pubkey: this.platform.publicKey, isSigner: true, isWritable: false }], data: discriminator('lock_market') })) };
    if (command.command_type === 'SETTLE') {
      const result = outcome(command.payload.result);
      if (result === undefined || !/^[0-9a-f]{64}$/i.test(command.payload.transcriptHash || '')) throw new Error('Settlement command has invalid result or transcript hash');
      return { signer: this.settlement, transaction: new Transaction().add(new TransactionInstruction({ programId: this.programId, keys: [
        { pubkey: addresses.config, isSigner: false, isWritable: false }, { pubkey: addresses.market, isSigner: false, isWritable: true }, { pubkey: addresses.vault, isSigner: false, isWritable: true }, { pubkey: this.treasury, isSigner: false, isWritable: true }, { pubkey: this.mint, isSigner: false, isWritable: false }, { pubkey: this.settlement.publicKey, isSigner: true, isWritable: false }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ], data: Buffer.concat([discriminator('settle_market'), Buffer.from([result]), Buffer.from(command.payload.transcriptHash, 'hex')]) })) };
    }
    throw new Error(`Unsupported market command ${command.command_type}`);
  }
}

function configuredMarketSigner(repository) { return process.env.FERAS_MARKET_SIGNER_MODE === 'automated-devnet' ? new DevnetMarketSigner({ repository }) : null; }
module.exports = { DevnetMarketSigner, configuredMarketSigner };
