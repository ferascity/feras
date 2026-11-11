#!/usr/bin/env node
const fs = require('node:fs');
const { MatchRepository } = require('./repository');
const { MatchRunner } = require('./match-runner');
const { UciEngine } = require('./uci-engine');
const { MarketCommandWorker } = require('./market-commands');
const { configuredMarketSigner } = require('./market-chain');

const POLL_MS = Number(process.env.FERAS_WORKER_POLL_MS || 1_000);

let balanceConnection = null;
let platformKeypair = null;
let lastBalanceWarning = 0;

/**
 * Auto-pairing without SOL creates rounds that can never open a market, which
 * then get abandoned. Refuse to stage a round when the automation wallet cannot
 * pay for market rent and fees.
 */
async function automationBalanceSol() {
  if (process.env.FERAS_MARKET_SIGNER_MODE !== 'automated-devnet') return null;
  const keypairPath = process.env.FERAS_AUTOMATION_PLATFORM_KEYPAIR_PATH;
  if (!keypairPath) return null;
  const { Connection, Keypair } = require('@coral-xyz/anchor').web3;
  if (!platformKeypair) {
    platformKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))));
  }
  if (!balanceConnection) balanceConnection = new Connection(process.env.FERAS_SOLANA_RPC_URL, 'confirmed');
  return (await balanceConnection.getBalance(platformKeypair.publicKey)) / 1e9;
}

async function main() {
  if (!process.env.FERAS_DATABASE_URL) throw new Error('FERAS_DATABASE_URL is required');
  const repository = new MatchRepository(process.env.FERAS_DATABASE_URL);
  const runner = new MatchRunner({
    repository,
    engineFactory: (profile) => new UciEngine({ options: {
      Threads: profile.threads,
      Hash: profile.hashMb,
      'Skill Level': profile.skillLevel,
    } }),
  });
  const marketWorker = new MarketCommandWorker({ repository, signer: configuredMarketSigner(repository) || undefined });
  let stopping = false;
  const stop = async () => { stopping = true; await repository.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);

  let lastAutoPairCheck = 0;
  while (!stopping) {
    try {
      if (process.env.FERAS_AUTO_PAIR_ENABLED === 'true' && Date.now() - lastAutoPairCheck > 30_000) {
        lastAutoPairCheck = Date.now();
        const abandoned = await repository.abandonStaleUnpairedMatches({
          graceSeconds: Number(process.env.FERAS_AUTO_PAIR_STALE_GRACE_SECONDS || 300),
        });
        if (abandoned.length > 0) {
          process.stdout.write(`[AutoPair] Abandoned stale unpaired matches: ${abandoned.join(', ')}\n`);
        }
        const live = await repository.listMatches('LIVE');
        const scheduled = await repository.listMatches('SCHEDULED');
        const now = Date.now();
        // Only a live match or a scheduled match that can still open a market
        // blocks the next pairing. Stale matches whose lock time has passed are
        // ignored so one failed round cannot stall the schedule forever.
        const activeScheduled = scheduled.filter((match) =>
          match.market_lock_time && new Date(match.market_lock_time).getTime() > now);
        if (live.length === 0 && activeScheduled.length === 0) {
          const minSol = Number(process.env.FERAS_AUTO_PAIR_MIN_SOL || 0.05);
          const balance = await automationBalanceSol();
          if (balance !== null && balance < minSol) {
            if (Date.now() - lastBalanceWarning > 10 * 60_000) {
              lastBalanceWarning = Date.now();
              process.stdout.write(`[AutoPair] Skipped: automation wallet holds ${balance.toFixed(4)} SOL, below FERAS_AUTO_PAIR_MIN_SOL=${minSol}\n`);
            }
          } else {
            const { autoPairMatch } = require('./matchmaker');
            const paired = await autoPairMatch({
              databaseUrl: process.env.FERAS_DATABASE_URL,
              countdownMinutes: Number(process.env.FERAS_AUTO_PAIR_MINUTES || 15),
            });
            process.stdout.write(`[AutoPair] Automatically staged ${paired.id} (${paired.title}) with betting open until ${paired.marketLockTime}\n`);
          }
        }
      }

      await repository.enqueueDueLocks();
      const match = await repository.claimNextRunnableMatch();
      if (match) await runner.runOnePly(match);
      await marketWorker.runOnce();
      if (!match) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    } catch (error) {
      process.stderr.write(`Coordinator error: ${error.stack || error.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
}

main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
