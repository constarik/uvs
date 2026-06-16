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

// §6.1 proportional pools: a tier's winner count derived from the participant count M as an
// integer num/den with one rounding mode. All-integer (BigInt) so JS, Python, Java (long) and
// C++ (int64) agree; operands are non-negative, so division is floor (no truncation ambiguity).
function resolveCount(M, rule) {
  const num = rule.num, den = rule.den, mode = rule.mode || 'round-half-up';
  if (!Number.isInteger(num) || !Number.isInteger(den) || !Number.isInteger(M) || den <= 0 || num < 0 || M < 0)
    throw new Error('INVALID: proportional num/den/M must be non-negative integers with den>0 (uvLs §6.1)');
  const Mb = BigInt(M), n = BigInt(num), d = BigInt(den);
  let c;
  if (mode === 'floor') c = (Mb * n) / d;
  else if (mode === 'ceil') c = (Mb * n + d - 1n) / d;
  else if (mode === 'round-half-up') c = (2n * Mb * n + d) / (2n * d);
  else throw new Error('INVALID: unknown rounding mode "' + mode + '" (uvLs §6.1)');
  return Number(c);
}

// build the prize pool: explicit `prizes`; a §6 `prizePool` of {tier,count[,rule]} tiers
// (proportional tiers carry a §6.1 rule); or `winners` seats.
function poolOf(rec) {
  if (Array.isArray(rec.prizes)) return rec.prizes;
  if (rec.rules && Array.isArray(rec.rules.prizes)) return rec.rules.prizes;
  // a published draw record nests the pool under `rules` (uvLs §7); accept either shape.
  const pp = Array.isArray(rec.prizePool) ? rec.prizePool
           : (rec.rules && Array.isArray(rec.rules.prizePool) ? rec.rules.prizePool : null);
  if (pp) {
    const M = rec.participants.length, prizes = [];
    let total = 0;
    for (const t of pp) {
      if (typeof t.tier !== 'string') throw new Error('INVALID: tier label must be a string (uvLs §6)');
      let count;
      if (t.rule) {
        count = resolveCount(M, t.rule);
        // §6.1/§9.4: a proportional tier carries both the rule and its resolved count; reject a mismatch.
        if (t.count != null && t.count !== count)
          throw new Error('INVALID: tier "' + t.tier + '" count ' + t.count + ' != rule-resolved ' + count + ' (uvLs §6.1)');
      } else {
        if (!Number.isInteger(t.count)) throw new Error('INVALID: tier count must be a JSON integer (uvLs §6.1)');
        count = t.count;
      }
      if (total + count > M) count = M - total;   // §6.1 ordering: clamp running total to M
      for (let k = 0; k < count; k++) prizes.push(t.tier);
      total += count;
    }
    return prizes;
  }
  const r = rec.rules || {};
  const n = rec.winners || rec.N || r.winners || r.N || 0;
  return Array.from({ length: n }, () => rec.prizeLabel || r.prizeLabel || 'WIN');
}

// ── §5.4 anchor round rule (optional) ────────────────────────────────────────
// drand quicknet: 3s period, genesis 1692803367. A draw bound by the DERIVED-R rule (uvLs §5.4.1)
// sets R = roundAt(genTime)+1, so genTime < timeOfRound(R) holds by construction and the operator
// has no choice over R. Given the TSA token's genTime (from `openssl ts -reply -text`) and the
// record's round, confirm the binding. This checks ORDERING; verify the token itself with `openssl ts -verify`.
const QUICKNET = { genesis: 1692803367, period: 3 };
function roundAt(unixSec) { return Math.floor((unixSec - QUICKNET.genesis) / QUICKNET.period) + 1; }
function timeOfRound(round) { return QUICKNET.genesis + (round - 1) * QUICKNET.period; }
function checkAnchorRound(genTime, round) {
  const expectedRound = roundAt(genTime) + 1, roundTime = timeOfRound(round);
  return { ok: round === expectedRound && genTime < roundTime, expectedRound, roundTime, genBeforeRound: genTime < roundTime };
}

module.exports = { sha256, combinedSeed, scoreOf, permute, allocate, lookup, poolOf, resolveCount, roundAt, timeOfRound, checkAnchorRound };

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
  const ca = rec.commitmentAnchor;
  if (ca && ca.genTime != null && rec.drand && rec.drand.round != null && String(ca.roundRule || '').startsWith('roundAt')) {
    const c = checkAnchorRound(ca.genTime, rec.drand.round);
    console.log('§5.4 derived-R: R==roundAt(genTime)+1 ?', rec.drand.round === c.expectedRound,
      '| genTime<timeOfRound(R) ?', c.genBeforeRound, '->', c.ok ? 'OK' : 'FAIL');
  }
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
