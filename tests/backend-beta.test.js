const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { PublicKey } = require('@coral-xyz/anchor').web3;
const {
  buildClaimMessage,
  normalizeCode,
  solToLamports,
  usdcToBaseUnits,
  verifyWalletSignature,
} = require('../backend/src/beta');

function testKeypair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  // SPKI wraps the raw 32-byte key after a fixed 12-byte prefix.
  return { privateKey, address: new PublicKey(der.subarray(12)).toBase58() };
}

test('claim messages normalise the invite code and bind wallet, code, and timestamp', () => {
  const message = buildClaimMessage({
    wallet: 'GkuWk8sLYWsquzUK2bh1uTzhgZMa6YT1R3H7xAbBFYhA',
    code: ' feras-beta-7k2m ',
    issuedAt: 1_760_000_000_000,
  });
  assert.equal(
    message,
    'feras-beta-claim:v1:GkuWk8sLYWsquzUK2bh1uTzhgZMa6YT1R3H7xAbBFYhA:FERAS-BETA-7K2M:1760000000000',
  );
  assert.equal(normalizeCode(' feras-beta-7k2m '), 'FERAS-BETA-7K2M');
});

test('wallet signature verification accepts a matching signature and rejects tampering', () => {
  const { privateKey, address } = testKeypair();
  const message = buildClaimMessage({ wallet: address, code: 'FERAS-BETA-AAAA', issuedAt: 1 });
  const signature = sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');

  assert.equal(
    verifyWalletSignature({ message, signature, publicKey: new PublicKey(address) }),
    true,
  );
  assert.equal(
    verifyWalletSignature({
      message: `${message}-tampered`,
      signature,
      publicKey: new PublicKey(address),
    }),
    false,
  );
  assert.equal(
    verifyWalletSignature({ message, signature: 'not-base64', publicKey: new PublicKey(address) }),
    false,
  );
});

test('starter amounts convert to base units without floating point drift', () => {
  assert.equal(solToLamports(0.25), 250_000_000);
  assert.equal(solToLamports(1), 1_000_000_000);
  assert.equal(usdcToBaseUnits(25), 25_000_000n);
  assert.equal(usdcToBaseUnits(0.000001), 1n);
  assert.equal(usdcToBaseUnits(12.5), 12_500_000n);
});
