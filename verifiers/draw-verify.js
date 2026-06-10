/* ============================================================================
 * UVS verifiable allocation — REFERENCE VERIFIER (Node.js)
 *
 * The whole thing is ONE operation: a seeded random PERMUTATION of the
 * participants, then a published prize pool dealt onto that order.
 *
 *   combinedSeed = SHA-256( serverSeed + ":" + drandRandomness )
 *   score(id)    = SHA-256( combinedSeed + ":" + id )
 *   permutation  = participants sorted by score DESC  (ties: id ASC)
 *   allocation   = order[i] receives prizes[i]   (null beyond the pool)
 *
 * Single lookup: one participant's rank + prize, without ranking everyone.
 *
 * No dependencies beyond the standard library. Same algorithm in
 * draw_verify.py / DrawVerify.java / draw_verify.cpp — all reproduce
 * test-vectors.json byte-for-byte. Re-run any of them, or write your own.
 *
 * Run:  node draw-verify.js <record.json> [id]
 * ========================================================================== */
'use strict';
const crypto = require('crypto');
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function combinedSeed(serverSeed, drandRandomness) { return sha256(serverSeed + ':' + drandRandomness); }
function scoreOf(combined, id) { return sha256(combined + ':' + id); }

// participant ids MUST be unique (uvLs §3.1): with a duplicate the id tie-break no longer
// yields a total order and two entries collide on the same score. Reject, don't rank.
// (ids are assumed NFC-normalized by the producer, per §3.1.)
function requireUnique(participants) {
  if (new Set(participants).size !== participants.length)
    throw new Error('INVALID: duplicate participant ids — record rejected (uvLs §3.1)');
}

// deterministic order: highest score first; ties broken by id ascending
function cmp(a, b) {
  if (a.score > b.score) return -1;
  if (a.score < b.score) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function permute(participants, combined) {
  requireUnique(participants);
  return participants.map((id) => ({ id, score: scoreOf(combined, id) })).sort(cmp);
}

// full allocation: each position in the permutation gets prizes[i]
function allocate(participants, combined, prizes) {
  return permute(participants, combined).map((p, i) => ({ id: p.id, rank: i + 1, prize: i < prizes.length ? prizes[i] : null, score: p.score }));
}

// single lookup — O(M) hashing, no sort
function lookup(participants, combined, id, prizes) {
  requireUnique(participants);
  const me = scoreOf(combined, id);
  let higher = 0, present = false;
  for (const a of participants) {
    if (a === id) { present = true; continue; }
    const s = scoreOf(combined, a);
    if (s > me || (s === me && a < id)) higher++;
  }
  const rank = higher + 1;
  return { id, present, rank, prize: present && rank <= prizes.length ? prizes[rank - 1] : null, score: me };
}

// build the prize pool from a record: explicit `prizes`, or `winners` seats
function poolOf(rec) {
  if (Array.isArray(rec.prizes)) return rec.prizes;
  const n = rec.winners || rec.N || 0;
  return Array.from({ length: n }, () => rec.prizeLabel || 'WIN');
}

module.exports = { sha256, combinedSeed, scoreOf, permute, allocate, lookup, poolOf };

// ---- CLI ----
if (require.main === module) {
  const fs = require('fs');
  const file = process.argv[2], id = process.argv[3];
  if (!file) { console.error('usage: node draw-verify.js <record.json> [id]'); process.exit(2); }
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  try { requireUnique(rec.participants); } catch (e) { console.error(e.message); process.exit(1); }
  const combined = combinedSeed(rec.serverSeed, rec.drand.randomness);
  const prizes = poolOf(rec);
  console.log('combinedSeed = SHA-256(serverSeed:drandRandomness) =', combined);
  if (id) {
    const r = lookup(rec.participants, combined, id, prizes);
    console.log(`${id}: ${r.present ? 'rank ' + r.rank + ' of ' + rec.participants.length + ' -> ' + (r.prize || 'no prize') : 'NOT in the committed list'}`);
  } else {
    const a = allocate(rec.participants, combined, prizes);
    const winners = a.filter((x) => x.prize != null);
    console.log(`${winners.length} prize(s) among ${rec.participants.length} participants:`);
    winners.forEach((w) => console.log(`  #${w.rank} ${w.id} -> ${w.prize}`));
  }
}
