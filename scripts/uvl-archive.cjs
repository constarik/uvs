// uvl-archive v0.1 — archival job for uvLottery results (spec §12).
// Scans uvl/ and uvl-test/ for sealed draws without result.json; when the target
// drand round exists, derives the winner with THE SAME derivation module the page
// uses (uvl/uvl-draw.js) and writes result.json next to the sealed artifacts.
// No secrets, idempotent, append-only: existing result.json files are never touched.
// Exit code 0 always (nothing-to-do is success); files written are picked up by
// the workflow's commit step.
'use strict';
const fs = require('fs');
const path = require('path');

global.self = global;                            // uvl-draw attaches to self
require(path.join(__dirname, '..', 'uvl', 'uvl-draw.js'));
const D = global.self.uvlDraw;

async function processDraw(dir) {
  const sealPath = path.join(dir, 'seal.json');
  const resultPath = path.join(dir, 'result.json');
  if (!fs.existsSync(sealPath)) return null;     // not sealed — nothing to archive
  if (fs.existsSync(resultPath)) return null;    // §12: idempotent
  const seal = JSON.parse(fs.readFileSync(sealPath, 'utf8'));
  if (Date.now() < Date.parse(seal.targetRoundTimeUtc)) {
    console.log(dir + ': sealed, round ' + seal.targetRound + ' not due yet');
    return null;
  }
  const round = await D.fetchDeciding(seal.targetRound);
  if (!round) { console.log(dir + ': round ' + seal.targetRound + ' not published yet'); return null; }
  const ids = seal.tickets.map(t => t.url);
  const combined = await D.combinedSeed(seal.serverSeed, round.randomness);
  const order = await D.permute(ids, combined);
  const byUrl = {}; seal.tickets.forEach(t => byUrl[t.url] = t.ticket);
  const result = {
    draw: seal.id, archivedAt: new Date().toISOString(),
    round: round.round, targetRound: seal.targetRound,
    usedFallback: round.round !== seal.targetRound,
    randomness: round.randomness, signature: round.signature || null,
    combinedSeed: combined,
    winner: order[0].id, winnerTicket: byUrl[order[0].id], winnerScore: order[0].score,
    successor: order[1] ? order[1].id : null,
    successorTicket: order[1] ? byUrl[order[1].id] : null,
    note: 'archive only (spec §12) — the result is derivable by anyone from seal.json and the drand round'
  };
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n');
  console.log(dir + ': ARCHIVED — winner ' + result.winnerTicket + ' ' + result.winner
    + ' (round ' + result.round + ')');
  return resultPath;
}

(async () => {
  const written = [];
  for (const root of ['uvl', 'uvl-test']) {
    const drawsDir = path.join(__dirname, '..', root, 'draws');
    if (!fs.existsSync(drawsDir)) continue;
    for (const name of fs.readdirSync(drawsDir)) {
      const dir = path.join(drawsDir, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      try {
        const p = await processDraw(dir);
        if (p) written.push(p);
      } catch (e) { console.error(dir + ': ERROR ' + e.message); }
    }
  }
  console.log(written.length + ' result(s) written');
})();
