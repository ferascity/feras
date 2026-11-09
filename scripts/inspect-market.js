#!/usr/bin/env node
/* Reads a Feras Devnet market account and prints its decoded fields. */
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC = process.env.FERAS_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey(process.env.FERAS_PROGRAM_ID || '3UJi7D53Cbj5TLGbbxFCzqW9vE7Ji5N5KKEdbQMWFaFA');
const STATUS = ['Open', 'Locked', 'Settled', 'Cancelled', 'Closed'];
const OUTCOME = ['White', 'Draw', 'Black'];

async function main() {
  const addresses = process.argv.slice(2).filter((value) => !value.startsWith('--'));
  if (addresses.length === 0) throw new Error('Usage: inspect-market.js <market-pda> [...]');
  const connection = new Connection(RPC, 'confirmed');
  for (const address of addresses) {
    const account = await connection.getAccountInfo(new PublicKey(address), 'confirmed');
    if (!account) { console.log(`${address}: missing`); continue; }
    if (!account.owner.equals(PROGRAM_ID)) { console.log(`${address}: owned by ${account.owner.toBase58()}`); continue; }
    const data = account.data;
    const lockTime = Number(data.readBigInt64LE(136));
    const status = STATUS[data[144]] || `unknown(${data[144]})`;
    const hasResult = data[145] === 1;
    const result = hasResult ? (OUTCOME[data[146]] || `unknown(${data[146]})`) : 'None';
    const pools = [0, 1, 2].map((i) => Number(data.readBigUInt64LE(147 + i * 8)));
    const totalPool = Number(data.readBigUInt64LE(171));
    const feeAmount = Number(data.readBigUInt64LE(219));
    const claimedTotal = Number(data.readBigUInt64LE(227));
    const claimDeadline = Number(data.readBigInt64LE(235));
    console.log(JSON.stringify({
      market: address,
      status,
      result,
      lockTime: new Date(lockTime * 1000).toISOString(),
      lockPassed: Date.now() / 1000 >= lockTime,
      pools: { white: pools[0], draw: pools[1], black: pools[2] },
      totalPool,
      feeAmount,
      claimedTotal,
      claimDeadline: claimDeadline ? new Date(claimDeadline * 1000).toISOString() : null,
    }, null, 2));
  }
}

main().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
