const crypto = require('node:crypto');

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`Cannot canonicalize ${typeof value}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function nextTranscriptHash(previousHash, event) {
  return sha256(`${previousHash}:${canonicalJson(event)}`);
}

const GENESIS_HASH = '0'.repeat(64);

function verifyTranscript(events, expectedHash = null) {
  let previousHash = GENESIS_HASH;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedSequence = index + 1;
    if (Number(event.sequence) !== expectedSequence) return { valid: false, reason: `Expected sequence ${expectedSequence}`, computedHash: previousHash };
    if (event.previous_hash !== previousHash) return { valid: false, reason: `Previous hash mismatch at sequence ${expectedSequence}`, computedHash: previousHash };
    const eventHash = nextTranscriptHash(previousHash, event.payload);
    if (event.event_hash !== eventHash) return { valid: false, reason: `Event hash mismatch at sequence ${expectedSequence}`, computedHash: previousHash };
    previousHash = eventHash;
  }
  if (expectedHash && expectedHash !== previousHash) return { valid: false, reason: 'Match transcript hash mismatch', computedHash: previousHash };
  return { valid: true, reason: null, computedHash: previousHash };
}

module.exports = { canonicalJson, sha256, nextTranscriptHash, verifyTranscript, GENESIS_HASH };
