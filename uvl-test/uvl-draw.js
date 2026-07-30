// uvl-draw v0.2 — browser port of the uvs-sdk derivation core + drand quicknet helpers.
// v0.2: drand is fetched through a list of official mirrors with fallback — a single
// endpoint rate-limiting a client (e.g. GitHub Actions runners) must not stall a draw.
// Semantics are a 1:1 port of uvs-sdk/src/lottery.js and drand.js (read 2026-07-27):
//   combinedSeed = SHA-256(serverSeed + ":" + drandRandomness)
//   score(id)    = SHA-256(combinedSeed + ":" + id)
//   order        = ids sorted by score DESC, ties by id ASC
// Hashes are over UTF-8 strings, hex lowercase — byte-identical to the SDK.
(function (root) {
  'use strict';
  const QUICKNET = {
    beacon: 'quicknet', period: 3, genesis: 1692803367,
    chainHash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971'
  };
  const BASES = [
    'https://api.drand.sh/' + QUICKNET.chainHash,
    'https://api2.drand.sh/' + QUICKNET.chainHash,
    'https://api3.drand.sh/' + QUICKNET.chainHash,
    'https://drand.cloudflare.com/' + QUICKNET.chainHash
  ];
  // try mirrors in order; non-OK statuses that are not 404 move to the next mirror
  async function apiGet(path) {
    const errs = [];
    for (const base of BASES) {
      try {
        const r = await fetch(base + path, { cache: 'no-store' });
        if (r.status === 404) return null;             // a real answer: not there yet
        if (!r.ok) { errs.push(base + ' -> HTTP ' + r.status); continue; }
        return r.json();
      } catch (e) { errs.push(base + ' -> ' + e.message); }
    }
    throw new Error('all drand mirrors failed for ' + path + ': ' + errs.join('; '));
  }

  async function sha256Str(s) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const combinedSeed = (serverSeed, randomness) => sha256Str(serverSeed + ':' + randomness);
  const score = (combined, id) => sha256Str(combined + ':' + id);

  const roundAt = unixSec => Math.floor((unixSec - QUICKNET.genesis) / QUICKNET.period) + 1;
  const timeOfRound = round => QUICKNET.genesis + (round - 1) * QUICKNET.period;

  async function fetchInfo() {           // live values at seal time (spec §8: don't hardcode)
    const r = await apiGet('/info');
    if (!r) throw new Error('drand /info -> 404');
    return r;                            // { period, genesis_time, ... }
  }
  async function fetchRound(round) {     // null while the round does not exist yet
    return apiGet('/public/' + round);   // { round, randomness, signature } | null
  }
  async function fetchLatest() {
    const r = await apiGet('/public/latest');
    if (!r) throw new Error('drand latest -> 404');
    return r;
  }
  // §7.1 fallback: the deciding round is the FIRST AVAILABLE round with number >= target.
  // Returns null while the chain has not reached the target yet.
  async function fetchDeciding(target) {
    const latest = await fetchLatest();
    if (latest.round < target) return null;         // not yet — keep waiting
    for (let r = target; r <= Math.min(target + 200, latest.round); r++) {
      const round = await fetchRound(r);
      if (round) return round;                      // normally the target itself
    }
    return latest;                                  // beacon gap wider than 200 rounds
  }

  // full ordering: [{id, score}] score DESC, ties id ASC — SDK permute()
  async function permute(ids, combined) {
    if (new Set(ids).size !== ids.length) throw new Error('duplicate ids (uvLs §3.1)');
    const scored = [];
    for (const id of ids) scored.push({ id: id, score: await score(combined, id) });
    scored.sort((a, b) => a.score > b.score ? -1 : a.score < b.score ? 1 :
                          a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return scored;
  }

  root.uvlDraw = { QUICKNET, sha256Str, combinedSeed, score, roundAt, timeOfRound,
                   fetchInfo, fetchRound, fetchDeciding, permute };
})(typeof self !== 'undefined' ? self : this);
