#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  if (!process.env.FERAS_DATABASE_URL) throw new Error('FERAS_DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.FERAS_DATABASE_URL });
  await client.connect();
  try {
    const directory = path.resolve(__dirname, '..', 'migrations');
    for (const file of (await fs.readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
      await client.query(await fs.readFile(path.join(directory, file), 'utf8'));
      process.stdout.write(`Applied ${file}\n`);
    }
  } finally { await client.end(); }
}

main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
