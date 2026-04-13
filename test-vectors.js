/**
 * UVS v1 — Test Vector Verification (Section 11)
 * Verifies all published test vectors against the reference implementation.
 */

const crypto = require('crypto');

const sha256 = x => crypto.createHash('sha256').update(x).digest('hex');
const sha512 = x => crypto.createHash('sha512').update(x).digest('hex');

// ── ChaCha20 reference implementation (RFC 8439) ──────────────────────────
function chacha20Block(key, nonce, counter) {
  const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]; // "expand 32-byte k"
  const k = new Uint32Array(8);
  const n = new Uint32Array(3);
  for (let i = 0; i < 8; i++) k[i] = key.readUInt32LE(i * 4);
  for (let i = 0; i < 3; i++) n[i] = nonce.readUInt32LE(i * 4);

  const s = new Uint32Array(16);
  s[0]=SIGMA[0]; s[1]=SIGMA[1]; s[2]=SIGMA[2]; s[3]=SIGMA[3];
  s[4]=k[0]; s[5]=k[1]; s[6]=k[2]; s[7]=k[3];
  s[8]=k[4]; s[9]=k[5]; s[10]=k[6]; s[11]=k[7];
  s[12]=counter>>>0; s[13]=n[0]; s[14]=n[1]; s[15]=n[2];

  const w = new Uint32Array(s);
  const rotl = (v, n) => ((v << n) | (v >>> (32 - n))) >>> 0;
  const qr = (a, b, c, d) => {
    w[a] = (w[a] + w[b]) >>> 0; w[d] = rotl(w[d] ^ w[a], 16);
    w[c] = (w[c] + w[d]) >>> 0; w[b] = rotl(w[b] ^ w[c], 12);
    w[a] = (w[a] + w[b]) >>> 0; w[d] = rotl(w[d] ^ w[a], 8);
    w[c] = (w[c] + w[d]) >>> 0; w[b] = rotl(w[b] ^ w[c], 7);
  };
  for (let i = 0; i < 10; i++) {
    qr(0,4,8,12); qr(1,5,9,13); qr(2,6,10,14); qr(3,7,11,15);
    qr(0,5,10,15); qr(1,6,11,12); qr(2,7,8,13); qr(3,4,9,14);
  }
  const out = Buffer.alloc(64);
  for (let i = 0; i < 16; i++) out.writeUInt32LE((w[i] + s[i]) >>> 0, i * 4);
  return out;
}

function chacha20Stream(key, nonce, numWords) {
  const words = [];
  let counter = 0;
  while (words.length < numWords) {
    const block = chacha20Block(key, nonce, counter++);
    for (let i = 0; i < 64 && words.length < numWords; i += 4)
      words.push(block.readUInt32LE(i));
  }
  return words;
}

// ── Test inputs (Section 11.1) ────────────────────────────────────────────
const serverSeed  = 'deadbeefcafebabe0102030405060708090a0b0c0d0e0f101112131415161718';
const clientSeed  = 'player_seed_42';
const nonce       = '1';
const minNonce    = 1;

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`    expected : ${expected}`);
    console.log(`    actual   : ${actual}`);
    failed++;
  }
}

console.log('\n══ UVS v1 Test Vector Verification ══\n');

// ── Vector 1: serverSeedHash (Section 11.2) ───────────────────────────────
console.log('Vector 1 — serverSeedHash:');
check(
  'SHA-256(serverSeed)',
  sha256(serverSeed),
  '0dc3c92d4a8b8c6cab67eee53e8177f679e5efa47cce6eb741255466f8dfcf3e'
);

// ── Vector 2: sessionId (Section 11.3) ───────────────────────────────────
console.log('\nVector 2 — sessionId:');
const serverSeedHash = sha256(serverSeed);
const sessionInput = `${serverSeedHash}:${clientSeed}:${minNonce}`;
check(
  'SHA-256(serverSeedHash + ":" + clientSeed + ":" + minNonce)',
  sha256(sessionInput),
  'b2332394bde343fb52bd8ff036c4558a29b480733c0d8973f2c78bfa8966fc35'
);

// ── Vector 3: combinedSeed (Section 11.4) ────────────────────────────────
console.log('\nVector 3 — combinedSeed:');
const combinedSeed = sha512(`${serverSeed}:${clientSeed}:${nonce}`);
check(
  'SHA-512(serverSeed + ":" + clientSeed + ":" + nonce)',
  combinedSeed,
  '446a9c96178ffba4ccceaf7fcd9682b477cdbad1ec6d2c2406a68223c807d11113824954467e8df504de08aa61ce27b0901f6f35a5661c759c6c338f0e817a99'
);

const csBuf = Buffer.from(combinedSeed, 'hex');
check('key (bytes 0-31)',   csBuf.slice(0, 32).toString('hex'), '446a9c96178ffba4ccceaf7fcd9682b477cdbad1ec6d2c2406a68223c807d111');
check('nonce (bytes 32-43)', csBuf.slice(32, 44).toString('hex'), '13824954467e8df504de08aa');

// ── Vector 4: ChaCha20 keystream (Section 11.5) ───────────────────────────
console.log('\nVector 4 — ChaCha20 keystream (counter=0):');
const key   = csBuf.slice(0, 32);
const nonce12 = csBuf.slice(32, 44);
const stream = chacha20Stream(key, nonce12, 8);

const expected4 = [618181213, 145813622, 1951481150, 3878276046, 36465895, 1329852316, 500724006, 987159170];
for (let i = 0; i < 8; i++) {
  check(`rngCalls[${i}] = ${expected4[i]} (0x${expected4[i].toString(16)})`, stream[i], expected4[i]);
}

// ── Vector 5: Full simulation step (Section 11.6) ─────────────────────────
console.log('\nVector 5 — Full simulation step:');
const outcome = (stream[0] % 6) + 1;
check('outcome = (rngCalls[0] % 6) + 1', outcome, 2);

function canonicalJSON(obj) {
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJSON).join(',') + ']';
  if (obj !== null && typeof obj === 'object') {
    return '{' + Object.keys(obj).sort().map(k =>
      JSON.stringify(k) + ':' + canonicalJSON(obj[k])
    ).join(',') + '}';
  }
  return JSON.stringify(obj);
}

const state = { balance: 900, step: 1 };
const stateHash = sha256(canonicalJSON(state));
check(
  'stateHash = SHA-256(canonicalJSON({ balance: 900, step: 1 }))',
  stateHash,
  '5e1fc7e7a541ecb9c8ed55c21950f40d5b7d06f79d8b9e4dcede9636520c3ce6'
);

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n══ Summary ══');
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
console.log(failed === 0 ? '\n  ✓ ALL VECTORS PASS\n' : '\n  ✗ FAILURES DETECTED\n');
process.exit(failed > 0 ? 1 : 0);
