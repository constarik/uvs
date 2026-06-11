/* ============================================================================
 * 3A — standalone anchored-draw server (uvLottery, genuine 🟢).
 *
 * Runs INDEPENDENTLY of the live PADDLA / registrar / /draw — a separate contour
 * so the real §5.4 anchor can ship without touching production.
 *
 *   POST /commit { participants, rules, model }
 *        -> serverSeed + commitment; commitmentHash = SHA-256(canonical record, NO round);
 *           stamp commitmentHash at the RFC-3161 TSA(s); derive R = roundAt(maxGenTime)+1 — the
 *           first drand round strictly after the proven stamp; return { sessionId, round R, ... }.
 *   POST /reveal { sessionId }   (after round R has published, ≤ one drand period)
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
const ots = require('./uvs-anchor-ots.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// drand randomness = SHA-256(signature BYTES); the v2 API returns {round,signature} only.
const hashBytes = (hex) => crypto.createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
const OPENSSL = process.env.UVS_OPENSSL || 'openssl';
const TSAS = process.env.UVS_TSA_LOCAL
  ? [{ name: 'local', local: process.env.UVS_TSA_LOCAL }]
  : [{ name: 'freetsa', url: 'https://freetsa.org/tsr' },          // ×2 independent TSAs, different
     { name: 'digicert', url: 'http://timestamp.digicert.com' }]; // operators/jurisdictions (uvLs §5.4)

// TSA CA bundle: lets the host VERIFY the RFC-3161 tokens it stores (audit A1) — without it
// every draw honestly stays 🟡. Baked into the Docker image by fetch at build; override via env.
// For the local-TSA test mode the local CA is the right trust root.
const TSA_CA = process.env.UVS_TSA_CA
  || (process.env.UVS_TSA_LOCAL ? path.join(process.env.UVS_TSA_LOCAL, 'ca.pem') : path.join(__dirname, 'tsa-ca-bundle.pem'));
const host = createHost({ sha256, versions: [1, 2, 3], tsa: { caFile: TSA_CA, openssl: OPENSSL } })
  .use(makeLottery({ sha256, name: 'lottery' }));

// Pending commit→reveal state, persisted to disk so it survives a process restart inside the
// commit→reveal window (serverSeed stays secret on the server until reveal). One file per session.
const STATE_DIR = process.env.UVS_STATE_DIR || path.join(os.tmpdir(), 'uvs3a-pending');
try { fs.mkdirSync(STATE_DIR, { recursive: true }); } catch (e) {}
const pending = {
  put(id, rec) { try { fs.writeFileSync(path.join(STATE_DIR, id + '.json'), JSON.stringify(rec)); } catch (e) {} },
  get(id) { try { return JSON.parse(fs.readFileSync(path.join(STATE_DIR, id + '.json'), 'utf8')); } catch (e) { return null; } },
  del(id) { try { fs.unlinkSync(path.join(STATE_DIR, id + '.json')); } catch (e) {} }
};

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
function send(res, code, obj) { const b = JSON.stringify(obj); res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }, CORS)); res.end(b); }
function body(req) { return new Promise((resolve) => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } }); }); }

async function commit(req, res) {
  const { participants, rules, model } = await body(req);
  if (!Array.isArray(participants) || !rules) return send(res, 400, { error: 'need participants[] and rules' });
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const commitment = sha256(serverSeed);
  // commitmentHash does NOT include the round — the round is DERIVED from the proven timestamp below,
  // so the operator has no choice over R (nothing to grind) and §5.4 holds by construction.
  const commitmentRecord = { participants, prizePool: rules.prizePool || rules, commitment, chainHash: drand.QUICKNET.chainHash };
  const commitmentHash = sha256(UVSCore.canonicalJSON(commitmentRecord));
  let anchor, otsProof;
  try {
    // RFC-3161 (primary; must succeed for 🟢) and OpenTimestamps (free second anchor; best-effort)
    // run concurrently — both only need commitmentHash, so commit latency ≈ the slower of the two.
    const [a, o] = await Promise.all([
      rfc.stamp(commitmentHash, TSAS, { openssl: OPENSSL }),
      ots.stamp(commitmentHash, { timeoutMs: 12000 }).catch(e => ({ ok: false, error: e.message }))
    ]);
    anchor = a; otsProof = (o && o.ok) ? o : null;
  } catch (e) { return send(res, 502, { error: 'TSA stamping failed: ' + e.message }); }
  // §5.4 round rule: R = first drand round strictly AFTER the latest stamp. Using max(genTime) guarantees
  // EVERY token predates R, deterministically (no choice = no grind). The wait is one drand period (<=3s).
  const genTime = Math.max.apply(null, anchor.tokens.map(t => t.genTime));
  const round = drand.roundAt(genTime) + 1;
  const roundTime = drand.timeOfRound(round);
  const sessionId = crypto.randomBytes(8).toString('hex');
  pending.put(sessionId, { serverSeed, commitment, round, roundTime, genTime, participants, rules, model: model || 'tickets', commitmentHash, anchor, ots: otsProof });
  send(res, 200, { sessionId, commitment, round, roundTime, commitmentHash, commitmentAnchor: anchor, ots: otsProof });
}

async function reveal(req, res) {
  const { sessionId } = await body(req);
  const s = pending.get(sessionId);
  if (!s) return send(res, 404, { error: 'unknown session' });
  if (s.roundTime > Math.floor(Date.now() / 1000)) return send(res, 425, { error: 'round not published yet', round: s.round, roundTime: s.roundTime });
  let r;
  try { r = await drand.fetchRound(s.round, { fetch: globalThis.fetch, hashBytes }); }
  catch (e) { return send(res, 502, { error: 'drand fetch failed: ' + e.message }); }
  const tokens = s.anchor.tokens;
  // commitTime = the latest stamp; R was derived as roundAt(commitTime)+1 in /commit, so genTime < timeOfRound(R).
  const commitTime = s.genTime;
  const dr = await host.draw('lottery', {
    serverSeed: s.serverSeed, commitment: s.commitment, commitTime,
    drand: { round: s.round, randomness: r.randomness },
    commitmentAnchor: {
      kind: 'rfc3161', commitmentHash: s.commitmentHash, roundRule: 'roundAt(genTime)+1',
      proof: tokens[0].proof, genTime: commitTime, tsa: tokens.map(t => t.tsa).join('+'),
      tokens, ots: s.ots || null            // all RFC-3161 tokens + optional OTS second anchor (matures on Bitcoin)
    },
    participants: s.participants, rules: s.rules, model: s.model
  });
  pending.del(sessionId);
  // reveal is the disclosure moment: return serverSeed + the drand round + the §5.4 anchor so the
  // client can show/download the full proof and re-derive independently.
  send(res, 200, Object.assign({}, dr, {
    serverSeed: s.serverSeed, commitment: s.commitment,
    drand: { beacon: drand.QUICKNET.beacon, chainHash: drand.QUICKNET.chainHash, round: s.round,
             randomness: r.randomness, roundTime: s.roundTime,
             verifyUrl: 'https://api.drand.sh/' + drand.QUICKNET.chainHash + '/public/' + s.round },
    commitmentHash: s.commitmentHash,
    commitmentAnchor: { kind: 'rfc3161', commitmentHash: s.commitmentHash, genTime: commitTime, roundRule: 'roundAt(genTime)+1',
                        tsa: tokens.map(t => t.tsa).join('+'), tokens, ots: s.ots || null }
  }));
}

// POST /anchor-record { record } | { commitmentHash }
// Notary anchor for a SETTLED record (e.g. a finished game). A game outcome is input-seeded — there is
// no future drand round in it — so we DON'T claim outcome-binding. Instead we stamp the record's
// commitmentHash at ×2 RFC-3161 (a neutral NOTARY: existence-at-time) and submit it to OpenTimestamps.
// Honest tier today is 🟡 notary; the OTS proof matures to 🟢 trail-immutability once Bitcoin confirms.
async function anchorRecord(req, res) {
  const b = await body(req);
  const commitmentHash = b.commitmentHash || sha256(UVSCore.canonicalJSON(b.record || b));
  let notary, otsProof;
  try {
    const [a, o] = await Promise.all([
      rfc.stamp(commitmentHash, TSAS, { openssl: OPENSSL }),
      ots.stamp(commitmentHash, { timeoutMs: 12000 }).catch(e => ({ ok: false, error: e.message }))
    ]);
    notary = a; otsProof = (o && o.ok) ? o : null;
  } catch (e) { return send(res, 502, { error: 'RFC-3161 notary stamping failed: ' + e.message }); }
  send(res, 200, {
    commitmentHash, notary, ots: otsProof, tier: 'notary',
    note: 'RFC-3161 = neutral notary (existence-at-time). A game outcome is input-seeded (no future drand round), ' +
          'so this is honest 🟡 notary now; the OpenTimestamps proof matures to 🟢 trail-immutability after a Bitcoin block confirms (~hours).'
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (req.method === 'POST' && req.url === '/commit') return await commit(req, res);
    if (req.method === 'POST' && req.url === '/reveal') return await reveal(req, res);
    if (req.method === 'POST' && req.url === '/anchor-record') return await anchorRecord(req, res);
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, tsas: TSAS.map(t => t.name), roundRule: 'roundAt(genTime)+1', ots: ots.available() });
    send(res, 404, { error: 'POST /commit | POST /reveal | POST /anchor-record | GET /health' });
  } catch (e) { send(res, 500, { error: e.message }); }
});

const PORT = process.env.PORT || 3939;
server.listen(PORT, () => console.log('3A anchored-draw server on :' + PORT + '  TSAs=' + TSAS.map(t => t.name).join('+') + '  round=roundAt(genTime)+1'));
