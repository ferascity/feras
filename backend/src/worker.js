#!/usr/bin/env node
const { MatchRepository } = require('./repository');
const { MatchRunner } = require('./match-runner');
const { UciEngine } = require('./uci-engine');
const { MarketCommandWorker } = require('./market-commands');
const { configuredMarketSigner } = require('./market-chain');

const POLL_MS = Number(process.env.FERAS_WORKER_POLL_MS || 1_000);

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

  while (!stopping) {
    try {
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
