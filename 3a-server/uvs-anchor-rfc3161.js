/* ============================================================================
 * UVS §5.4 commitment-anchor — RFC 3161 Time-Stamping (uvLottery).
 *
 * Stamps a draw's `commitmentHash` at one or more independent RFC 3161 TSAs to
 * prove the commitment existed BEFORE the future drand round R — operator-
 * independent evidence, the immediate-token path that fits a seconds-to-minutes
 * commit→R window (uvLs §5.4). Verification is the spec's reference path:
 * `openssl ts -verify`, and the token's `genTime` must be < timeOfRound(R).
 *
 * Production: POST the request to a public TSA (FreeTSA, a commercial CA).
 * Test/dev:   produce the token from a LOCAL openssl TSA (no network).
 * Uses the openssl `ts` CLI — no JS ASN.1 dependency.
 * ========================================================================== */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

function _tmp(ext) { return path.join(os.tmpdir(), 'uvs3a_' + Math.random().toString(16).slice(2) + ext); }

/** Build a DER RFC 3161 request (.tsq) over an already-computed SHA-256 hex digest. */
function buildRequest(hashHex, openssl) {
  const out = _tmp('.tsq');
  execFileSync(openssl, ['ts', '-query', '-digest', hashHex, '-sha256', '-no_nonce', '-cert', '-out', out],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  const buf = fs.readFileSync(out); fs.unlinkSync(out); return buf;
}

/** PRODUCTION: POST the .tsq to a public TSA over HTTPS; resolve the .tsr token bytes. */
function postToTSA(tsq, tsaUrl) {
  return new Promise((resolve, reject) => {
    const u = new URL(tsaUrl);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query', 'Content-Length': tsq.length }
    }, res => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(Buffer.concat(c))); });
    req.on('error', reject); req.write(tsq); req.end();
  });
}

/** TEST/DEV: produce a token from a LOCAL openssl TSA whose config + signer live in `tsaDir`. */
function localReply(tsq, tsaDir, openssl) {
  const qf = _tmp('.tsq'), out = _tmp('.tsr');
  fs.writeFileSync(qf, tsq);
  execFileSync(openssl, ['ts', '-reply', '-config', path.join(tsaDir, 'tsa.cnf'), '-queryfile', qf, '-out', out],
    { cwd: tsaDir, stdio: ['ignore', 'ignore', 'ignore'] });
  const buf = fs.readFileSync(out); fs.unlinkSync(qf); fs.unlinkSync(out); return buf;
}

/** Parse the `Time stamp:` line of `openssl ts -reply -text` into unix seconds. */
function _genTime(tsr, openssl) {
  const f = _tmp('.tsr'); fs.writeFileSync(f, tsr);
  let txt = '';
  try { txt = execFileSync(openssl, ['ts', '-reply', '-in', f, '-text'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
  finally { try { fs.unlinkSync(f); } catch (e) {} }
  const m = txt.match(/Time stamp:\s*(.+)/);
  if (!m) return null;
  const t = Date.parse(m[1].trim());
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

/**
 * Verify a .tsr token over `hashHex` against a CA cert.
 * @returns {{ ok: boolean, genTime: number|null }}  ok = signature + digest verify; genTime in unix seconds.
 */
function verify(hashHex, tsr, caFile, openssl) {
  const f = _tmp('.tsr'); fs.writeFileSync(f, tsr);
  let ok = false;
  try {
    const r = execFileSync(openssl, ['ts', '-verify', '-digest', hashHex, '-in', f, '-CAfile', caFile],
      { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    ok = /Verification:\s*OK/i.test(r);
  } catch (e) { ok = /Verification:\s*OK/i.test(((e.stdout || '') + (e.stderr || '')).toString()); }
  finally { try { fs.unlinkSync(f); } catch (e) {} }
  return { ok, genTime: _genTime(tsr, openssl) };
}

/**
 * High-level: stamp `commitmentHash` at a list of TSAs and return §5.4 anchor evidence.
 * @param tsas  [{ name, url }]  (production) — or [{ name, local: tsaDir }] (test).
 * @returns {Promise<{ commitmentHash, tokens: [{ tsa, proof(base64), genTime }] }>}
 */
async function stamp(hashHex, tsas, opts) {
  opts = opts || {};
  const openssl = opts.openssl || 'openssl';
  const tsq = buildRequest(hashHex, openssl);
  const tokens = [];
  for (const t of tsas) {
    const tsr = t.local ? localReply(tsq, t.local, openssl) : await postToTSA(tsq, t.url);
    tokens.push({ tsa: t.name, proof: tsr.toString('base64'), genTime: _genTime(tsr, openssl) });
  }
  return { commitmentHash: hashHex, kind: 'rfc3161', tokens };
}

module.exports = { buildRequest, postToTSA, localReply, verify, stamp };
