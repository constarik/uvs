/* ============================================================================
 * Verifiable-odds engine — the "bright case" math, shared by node test + browser.
 *
 * Proves something random.org / one-shot provably-fair CANNOT: that a PUBLISHED
 * distribution actually held over MANY events, with no way for the operator to
 * grind the seeds (entropy is injected from a FUTURE drand round).
 *
 * Each draw:  seed_i = SHA-256(houseSeed : drandRandomness : i)
 *             tier_i = weightedPick(seed_i, publishedRates)
 * Anyone replays every draw and measures the realized histogram vs the claim.
 * ========================================================================== */
(function (root) {
  'use strict';

  // --- bundled synchronous SHA-256 (ASCII/byte string; chars must be 0..255) ---
  function sha256hex(ascii) {
    function rrot(x, n) { return (x >>> n) | (x << (32 - n)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = '';
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = sha256hex.h = sha256hex.h || [], k = sha256hex.k = sha256hex.k || [], primeCounter = k.length;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (var i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) { return null; }
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (var jj = 0; jj < words.length;) {
      var w = words.slice(jj, jj += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (var i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7] + (rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
          + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rrot(w15, 7) ^ rrot(w15, 18) ^ (w15 >>> 3))
            + w[i - 7] + (rrot(w2, 17) ^ rrot(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash); hash[4] = (hash[4] + temp1) | 0;
      }
      for (var i = 0; i < 8; i++) { hash[i] = (hash[i] + oldHash[i]) | 0; }
    }
    for (var i = 0; i < 8; i++) { for (var j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); } }
    return result;
  }
  function hexToBin(hex) { var s = ''; for (var i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16)); return s; }
  function randomnessOfSig(sigHex) { return sha256hex(hexToBin(sigHex)); }   // drand randomness = SHA-256(signature bytes)

  // --- drand quicknet timing (3s period) ---
  var QUICKNET = { period: 3, genesis: 1692803367, chainHash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971' };
  function roundAt(unixSec) { return Math.floor((unixSec - QUICKNET.genesis) / QUICKNET.period) + 1; }
  function timeOfRound(round) { return QUICKNET.genesis + (round - 1) * QUICKNET.period; }
  function futureRound(unixNow, aheadSec) { var r = roundAt(unixNow) + Math.max(1, Math.ceil((aheadSec || 9) / QUICKNET.period)); return { round: r, time: timeOfRound(r) }; }

  // --- the published claim ---
  var RATES = [
    { key: 'legendary', label: 'Legendary', pct: 1, color: '#f2c14e' },
    { key: 'epic', label: 'Epic', pct: 9, color: '#b06efe' },
    { key: 'rare', label: 'Rare', pct: 30, color: '#6ea8fe' },
    { key: 'common', label: 'Common', pct: 60, color: '#8b95a5' }
  ];

  // uniform in [0,1) from a full-entropy hex seed (13 hex chars < 2^52, exact)
  function u01(seedHex) { return parseInt(seedHex.slice(0, 13), 16) / Math.pow(2, 52); }
  function weightedPick(seedHex, rates) {
    var u = u01(seedHex), c = 0;
    for (var i = 0; i < rates.length; i++) { c += rates[i].pct / 100; if (u < c) return i; }
    return rates.length - 1;
  }
  function drawSeed(houseSeed, drandRandomness, i) { return sha256hex(houseSeed + ':' + drandRandomness + ':' + i); }

  var api = { sha256hex, randomnessOfSig, QUICKNET, roundAt, timeOfRound, futureRound, RATES, u01, weightedPick, drawSeed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Odds = api;
})(typeof window !== 'undefined' ? window : this);
