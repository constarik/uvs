/* ============================================================================
 * 3A — standalone anchored-draw server (uvLottery, genuine 🟢).
 *
 * Runs INDEPENDENTLY of the live PADDLA / registrar / /draw — a separate contour
 * so the real §5.4 anchor can ship without touching production.
 *
 *   POST /commit { participants, rules, model }
 *        -> generate serverSeed, commitment, a FUTURE drand round R,
 *           commitmentHash = SHA-256(canonical commitment record),
 *           stamp commitmentHash at the configured RFC-3161 TSA(s),
 *           return { sessionId, commitment, round R, commitmentAnchor }.
 *   POST /reveal { sessionId }   (after round R has published)
 *        -> fetch randomness(R), run the draw, return the 🟢 record.
 *
 * Built-in http only — no framework. Stamping/verification: ./uvs-anchor-rfc3161.js
 * (openssl `ts`). TSAs via env; for a network-free demo point UVS_TSA_LOCAL at a
 * local TSA dir (see _3a_test.js setupLocalTSA).
 * ========================================================================== */
'use strict';
const http = require('http');
const crypto = require('crypto');
const UVSCore = require('./uvs-core.js');
const drand = require('./uvs-anchor-drand.js');
const { makeLottery } = require('./uvs-lottery.js');
const { createHost } = require('./uvs-host.js');
const rfc = require('./uvs-anchor-rfc3161.js');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const OPENSSL = process.env.UVS_OPENSSL || 'openssl';
const AHEAD = parseInt(process.env.UVS_ROUND_AHEAD || '9', 10);   // seconds until R
const TSAS = process.env.UVS_TSA_LOCAL
  ? [{ name: 'local', local: process.env.UVS_TSA_LOCAL }]
  : [{ name: 'freetsa', url: 'https://freetsa.org/tsr' }];        // add a 2nd jurisdiction in prod (×2)

const host = createHost({ sha256, versions: [1, 2, 3] }).use(makeLottery({ sha256, name: 'lottery' }));
const pending = new Map();   // sessionId -> commit state (in-memory; swap for storage in prod)

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
function send(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }, CORS)); res.end(b); }
function body(req) { return new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } }); }); }

async function commit(req, res) {
  const { participants, rules, model } = await body(req);
  if (!Array.isArray(participants) || !rules) return send(res, 400, { error: 'need participants[] and rules' });
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const commitment = sha256(serverSeed);
  const fr = drand.futureRound(Math.floor(Date.now() / 1000), AHEAD);
  const commitmentRecord = { participants, prizePool: rules.prizePool || rules, commitment, chainHash: drand.QUICKNET.chainHash, round: fr.round };
  const commitmentHash = sha256(UVSCore.canonicalJSON(commitmentRecord));
  let anchor;
  try { anchor = await rfc.stamp(commitmentHash, TSAS, { openssl: OPENSSL }); }
  catch (e) { return send(res, 502, { error: 'TSA stamping failed: ' + e.message }); }
  const sessionId = crypto.randomBytes(8).toString('hex');
  pending.set(sessionId, { serverSeed, commitment, fr, participants, rules, model: model || 'tickets', commitmentHash, anchor });
  send(res, 200, { sessionId, commitment, round: fr.round, roundTime: fr.time, commitmentHash, commitmentAnchor: anchor });
}

async function reveal(req, res) {
  const { sessionId } = await body(req);
  const s = pending.get(sessionId);
  if (!s) return send(res, 404, { error: 'unknown session' });
  if (drand.timeOfRound(s.fr.round) > Math.floor(Date.now() / 1000)) return send(res, 425, { error: 'round not published yet', round: s.fr.round, roundTime: s.fr.time });
  let r;
  try { r = await drand.fetchRound(s.fr.round, { fetch: globalThis.fetch }); }
  catch (e) { return send(res, 502, { error: 'drand fetch failed: ' + e.message }); }
  const token = s.anchor.tokens[0];
  const dr = await host.draw('lottery', {
    serverSeed: s.serverSeed, commitment: s.commitment, commitTime: token.genTime,
    drand: { round: s.fr.round, randomness: r.randomness },
    commitmentAnchor: { kind: 'rfc3161', commitmentHash: s.commitmentHash, proof: token.proof, genTime: token.genTime, tsa: token.tsa },
    participants: s.participants, rules: s.rules, model: s.model
  });
  pending.delete(sessionId);
  send(res, 200, dr);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (req.method === 'POST' && req.url === '/commit') return await commit(req, res);
    if (req.method === 'POST' && req.url === '/reveal') return await reveal(req, res);
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, tsas: TSAS.map(t => t.name), ahead: AHEAD });
    send(res, 404, { error: 'POST /commit | POST /reveal | GET /health' });
  } catch (e) { send(res, 500, { error: e.message }); }
});

const PORT = process.env.PORT || 3939;
server.listen(PORT, () => console.log('3A anchored-draw server on :' + PORT + '  TSAs=' + TSAS.map(t => t.name).join('+') + '  ahead=' + AHEAD + 's'));
