#!/usr/bin/env node
// uvl-verify v0.1 — standalone verifier for one uvLottery draw folder (spec §17).
// Zero dependencies, plain Node, one file, no build step.
//
//   node uvl-verify.cjs <draw-folder> [--round-file <file>] [--offline]
//
// Every step is reported separately (spec §17.2). Exit codes:
//   0  every step OK
//   1  a MISMATCH — the published result does not follow from the artifacts
//   2  something UNVERIFIED and nothing mismatched (e.g. no network)
//
// This script never attests to itself: a replaced file would print a replaced
// hash. Hash it externally instead:
//   sha256sum uvl-verify.cjs        (Windows: Get-FileHash uvl-verify.cjs)
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = '0.3';   // v0.3: frozen weights-rule.txt + commitment cross-check (§16.4 1b)
const OK = 'OK', MISMATCH = 'MISMATCH', UNVERIFIED = 'UNVERIFIED';

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const sha256str = s => sha256(Buffer.from(s, 'utf8'));
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const isoOf = unixSec => new Date(unixSec * 1000).toISOString().replace('.000Z', '.000Z');

const steps = [];
function report(n, title, status, lines) {
  steps.push({ n, title, status, lines: [].concat(lines || []) });
}

function parseArgs(argv) {
  const out = { dir: null, roundFile: null, offline: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--round-file') out.roundFile = argv[++i];
    else if (a === '--offline') out.offline = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!out.dir) out.dir = a;
  }
  return out;
}

// ── step 1 ── the dump chain (§11.4): every link hashes to what it claims, the
// chain is ordered and append-only, and the seal points at its last link.
function stepChain(dir, chain, seal) {
  const links = (chain && chain.links) || [];
  if (!links.length) return report(1, 'dump chain', MISMATCH, 'chain.json carries no links');
  const bad = [], good = [];
  links.forEach((l, i) => {
    if (l.n !== i + 1) bad.push('position ' + (i + 1) + ' declares n=' + l.n);
    const f = path.join(dir, l.file);
    if (!fs.existsSync(f)) { bad.push(l.file + ': file missing'); return; }
    const h = sha256(fs.readFileSync(f));
    if (h !== l.sha256) bad.push(l.file + ': sha256 ' + h + ' != declared ' + l.sha256);
    else good.push('link ' + l.n + ' ' + l.file + ' ' + h.slice(0, 12) + '…');
  });
  const last = links[links.length - 1];
  if (seal.chainLink !== last.n)
    bad.push('seal names link ' + seal.chainLink + ', chain ends at ' + last.n);
  if (seal.dumpSha256 !== last.sha256)
    bad.push('sealed dump hash differs from the last chain link');
  report(1, 'dump chain', bad.length ? MISMATCH : OK,
         bad.length ? bad : good.concat('sealed link is the last one (' + last.n + ')'));
  return last;
}

// ── step 2 ── the ticket list (§4–§6): the frozen parser, run on the sealed
// dump, must reproduce the sealed list exactly — same entries, same order.
function stepTickets(dir, seal) {
  const snapPath = path.join(dir, seal.parserSnapshotFile || 'uvl-parser-snapshot.js');
  if (!fs.existsSync(snapPath))
    return report(2, 'ticket list', UNVERIFIED, 'parser snapshot missing: ' + snapPath);
  const snapHash = sha256(fs.readFileSync(snapPath));
  if (snapHash !== seal.parserSha256)
    return report(2, 'ticket list', MISMATCH,
      'parser snapshot sha256 ' + snapHash + ' != sealed ' + seal.parserSha256);

  let parser;
  try { parser = require(path.resolve(snapPath)); }
  catch (e) { return report(2, 'ticket list', UNVERIFIED, 'parser will not load: ' + e.message); }

  const dumpPath = path.join(dir, seal.dumpFile);
  if (!fs.existsSync(dumpPath))
    return report(2, 'ticket list', UNVERIFIED, 'sealed dump missing: ' + seal.dumpFile);
  const html = fs.readFileSync(dumpPath, 'utf8');
  const profile = seal.profile || {};
  const policy = (profile.tickets && profile.tickets.policy) || 'one-per-person';

  let built;
  try {
    built = parser.buildTickets(html, { exclude: profile.excludes || [], policy: policy });
  } catch (e) {
    return report(2, 'ticket list', UNVERIFIED,
      'this parser cannot run policy "' + policy + '": ' + e.message);
  }

  const mine0 = built.tickets, theirs = seal.tickets || [];
  let mine = mine0, weightNote = null, ruleNote2 = null;
  if (policy === 'weighted') {
    // §16.4 — the expansion is trust-chain code: everything it feeds on is frozen
    // in this folder and hash-committed in seal.json. Any divergence is MISMATCH,
    // not noise (contrast with the verifier's own snapshot, §17.3).
    const frozen = (name, file, sealedSha, required) => {
      const p = path.join(dir, file);
      if (!fs.existsSync(p)) return { err: [required ? MISMATCH : UNVERIFIED, name + ' missing: ' + file] };
      const h = sha256(fs.readFileSync(p));
      if (sealedSha && h !== sealedSha)
        return { err: [MISMATCH, name + ' sha256 ' + h + ' != sealed ' + sealedSha] };
      return { path: p };
    };
    const mf = frozen('merge snapshot', seal.mergeSnapshotFile || 'uvl-merge-snapshot.js', seal.mergeSha256, true);
    if (mf.err) return report(2, 'ticket list', mf.err[0], mf.err[1]);
    const ct = frozen('carry tickets', seal.carryTicketsFile || 'carry-tickets.json', seal.carryTicketsSha256, true);
    if (ct.err) return report(2, 'ticket list', ct.err[0], ct.err[1]);
    const cr = frozen('carry result', seal.carryResultFile || 'carry-result.json', seal.carryResultSha256, true);
    if (cr.err) return report(2, 'ticket list', cr.err[0], cr.err[1]);
    // §16.4 1b — the revealed rule file is frozen here; if the carry draw's seal
    // committed to a rule hash, the two must be the same bytes. This is the whole
    // point of the pair: the rule provably predates the rehearsal result.
    let ruleNote = null;
    if (seal.ruleFile) {
      const rf = frozen('rule file', seal.ruleFile, seal.ruleFileSha256, true);
      if (rf.err) return report(2, 'ticket list', rf.err[0], rf.err[1]);
      const rh = sha256(fs.readFileSync(rf.path));
      if (seal.carryRuleCommitSha256) {
        if (rh !== seal.carryRuleCommitSha256)
          return report(2, 'ticket list', MISMATCH, 'rule file sha256 ' + rh
            + ' != commitment in the carry draw\'s seal ' + seal.carryRuleCommitSha256);
        ruleNote = 'rule file matches the commitment sealed before the rehearsal result (§16.4)';
      } else ruleNote = 'rule file frozen; carry seal recorded no commitment (pre-1b rehearsal)';
    }
    ruleNote2 = ruleNote;
    let merge;
    try { merge = require(path.resolve(mf.path)); }
    catch (e) { return report(2, 'ticket list', UNVERIFIED, 'merge snapshot will not load: ' + e.message); }
    const carryT = readJson(ct.path), carryR = readJson(cr.path);
    const co = (seal.profile && seal.profile.carryOver) || {};
    const winnerUrl = String(carryR.winnerPerson || carryR.winner || '').split('#')[0] || null;
    try {
      const ex = merge.expandWeighted(mine0, {
        tickets: carryT.tickets || carryT, winnerUrl: winnerUrl, weights: co.weights });
      mine = ex.tickets;
      weightNote = ex.persons + ' persons (' + ex.carried + ' carried) -> ' + mine.length
        + ' tickets, merge v' + (merge.VERSION || '?');
    } catch (e) {
      return report(2, 'ticket list', UNVERIFIED, 'weighted expansion failed: ' + e.message);
    }
  }
  const bad = [];
  if (mine.length !== theirs.length)
    bad.push('recomputed ' + mine.length + ' tickets, sealed list has ' + theirs.length);
  const n = Math.min(mine.length, theirs.length);
  for (let i = 0; i < n; i++) {
    if (mine[i].url !== theirs[i].url || mine[i].ticket !== theirs[i].ticket) {
      bad.push('first divergence at position ' + (i + 1) + ': recomputed ' +
               mine[i].ticket + ' ' + mine[i].url + ', sealed ' +
               theirs[i].ticket + ' ' + theirs[i].url);
      break;
    }
  }
  const listPath = path.join(dir, seal.ticketListFile || 'tickets.json');
  if (fs.existsSync(listPath) && seal.ticketListSha256) {
    const h = sha256(fs.readFileSync(listPath));
    if (h !== seal.ticketListSha256)
      bad.push(path.basename(listPath) + ': sha256 ' + h + ' != sealed ' + seal.ticketListSha256);
  }
  report(2, 'ticket list', bad.length ? MISMATCH : OK, bad.length ? bad : [
    mine.length + ' tickets reproduced from ' + built.entriesTotal + ' entries, order identical',
    'parser ' + (built.class ? built.class.name + ' v' + built.version : 'v' + built.version) +
      ', policy ' + policy + ', excludes ' + ((profile.excludes || []).length)
  ].concat(weightNote ? [weightNote] : []).concat(ruleNote2 ? [ruleNote2] : []));
}

// ── step 3 ── the seal precedes the round (§7–§8). Pure arithmetic on the
// genesis/period recorded at seal: nothing here needs the network.
function stepOrder(seal) {
  const d = seal.drand || {};
  const bad = [];
  if (!d.genesisTime || !d.period) return report(3, 'seal precedes round', UNVERIFIED,
    'seal.json carries no drand genesis/period');
  const roundTime = d.genesisTime + (seal.targetRound - 1) * d.period;
  const sealedAt = Math.floor(Date.parse(seal.sealedAt) / 1000);
  if (!Number.isFinite(sealedAt)) bad.push('unreadable sealedAt: ' + seal.sealedAt);
  else if (roundTime <= sealedAt)
    bad.push('target round ' + seal.targetRound + ' was already decidable at seal time');
  if (seal.targetRoundTimeUtc && Date.parse(seal.targetRoundTimeUtc) / 1000 !== roundTime)
    bad.push('declared round time ' + seal.targetRoundTimeUtc + ' != computed ' + isoOf(roundTime));
  const gapMin = ((roundTime - sealedAt) / 60).toFixed(1);
  report(3, 'seal precedes round', bad.length ? MISMATCH : OK, bad.length ? bad : [
    'sealed ' + seal.sealedAt + ', round ' + seal.targetRound + ' due ' + isoOf(roundTime),
    'gap ' + gapMin + ' min — the outcome could not be known at seal time'
  ]);
}

// ── step 4 ── the round itself. The only step that wants the network; feed it a
// saved round with --round-file to run fully offline (§17.7).
async function stepRound(seal, args, result) {
  const target = seal.targetRound;
  let round = null, source = null;
  if (args.roundFile) {
    try { round = readJson(args.roundFile); source = 'file ' + args.roundFile; }
    catch (e) { return report(4, 'drand round', UNVERIFIED, 'cannot read round file: ' + e.message), null; }
  } else if (!args.offline) {
    try { round = await fetchDeciding(seal, target); source = 'drand network'; }
    catch (e) { return report(4, 'drand round', UNVERIFIED, 'all mirrors failed: ' + e.message), null; }
    if (!round) return report(4, 'drand round', UNVERIFIED,
      'the beacon has not reached round ' + target + ' yet'), null;
  } else {
    return report(4, 'drand round', UNVERIFIED, 'offline and no --round-file given'), null;
  }

  const bad = [], notes = ['round ' + round.round + ' via ' + source];
  if (round.round < target)
    bad.push('round ' + round.round + ' is below the target ' + target);
  else if (round.round > target)
    notes.push('fallback in effect (§7.1): first available round >= ' + target);
  // quicknet: randomness = SHA-256(signature). Checkable without any BLS library.
  if (round.signature && round.randomness) {
    const h = sha256(Buffer.from(round.signature, 'hex'));
    if (h !== round.randomness) bad.push('randomness is not SHA-256 of the signature');
    else notes.push('randomness = SHA-256(signature) ✓');
  }
  if (result && result.randomness && result.randomness !== round.randomness)
    bad.push('published randomness differs from the beacon: ' + result.randomness);
  notes.push('BLS signature validity is out of scope for a zero-dependency script —');
  notes.push('see the manual instruction for checking it against the quicknet public key');
  report(4, 'drand round', bad.length ? MISMATCH : OK, bad.length ? bad : notes);
  return bad.length ? null : round;
}

// drand mirrors, in order. A single endpoint throttling a client must not stall
// verification (the same lesson the archival job learned on GitHub runners).
const MIRRORS = ['https://api.drand.sh/', 'https://api2.drand.sh/',
                 'https://api3.drand.sh/', 'https://drand.cloudflare.com/'];

async function apiGet(chainHash, p) {
  const errs = [];
  for (const base of MIRRORS) {
    try {
      const r = await fetch(base + chainHash + p, { cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) { errs.push(base + ' HTTP ' + r.status); continue; }
      return await r.json();
    } catch (e) { errs.push(base + ' ' + e.message); }
  }
  throw new Error(errs.join('; '));
}

// §7.1: the deciding round is the first available round with number >= target.
async function fetchDeciding(seal, target) {
  const ch = (seal.drand && seal.drand.chainHash) || '';
  const latest = await apiGet(ch, '/public/latest');
  if (!latest || latest.round < target) return null;
  for (let r = target; r <= Math.min(target + 200, latest.round); r++) {
    const round = await apiGet(ch, '/public/' + r);
    if (round) return round;
  }
  return latest;
}

// ── step 5 ── the derivation (§17.6). combinedSeed = SHA-256(serverSeed:randomness),
// score(id) = SHA-256(combinedSeed:id), order = score DESC, ties id ASC.
function stepDerive(seal, round, result) {
  const combined = sha256str(seal.serverSeed + ':' + round.randomness);
  const ids = (seal.tickets || []).map(t => t.url);
  if (new Set(ids).size !== ids.length)
    return report(5, 'winner derivation', MISMATCH, 'sealed list contains duplicate ids (uvLs §3.1)');
  const ticketOf = new Map((seal.tickets || []).map(t => [t.url, t.ticket]));
  const scored = ids.map(id => ({ id, score: sha256str(combined + ':' + id) }));
  scored.sort((a, b) => a.score > b.score ? -1 : a.score < b.score ? 1 :
                        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const personOf = id => String(id).split('#')[0];
  // succession skips the winner's own replicas (§16.4); for plain draws this is rank 2
  const win = scored[0], next = scored.find(s => personOf(s.id) !== personOf(win.id));

  const derived = [
    'combinedSeed ' + combined,
    'rank 1  ' + ticketOf.get(win.id) + '  ' + win.id,
    '        score ' + win.score,
    'rank 2  ' + (next ? ticketOf.get(next.id) + '  ' + next.id : '—') + '   (succession, §14.3)'
  ];
  if (!result)
    return report(5, 'winner derivation', UNVERIFIED,
      ['no result.json in this folder — nothing published to compare against'].concat(derived));

  const bad = [];
  if (result.combinedSeed && result.combinedSeed !== combined)
    bad.push('published combinedSeed ' + result.combinedSeed + ' != recomputed ' + combined);
  if (result.winner !== win.id) bad.push('published winner ' + result.winner + ' != recomputed ' + win.id);
  if (result.winnerTicket && result.winnerTicket !== ticketOf.get(win.id))
    bad.push('published ticket ' + result.winnerTicket + ' != recomputed ' + ticketOf.get(win.id));
  if (result.winnerScore && result.winnerScore !== win.score)
    bad.push('published winner score differs from recomputed');
  if (result.successor && next && result.successor !== next.id)
    bad.push('published successor ' + result.successor + ' != recomputed ' + next.id);
  report(5, 'winner derivation', bad.length ? MISMATCH : OK, bad.length ? bad : derived);
}

// §17.3: the frozen copy exists for archive reproducibility, not for trust. Its
// hash divergence from the current file carries no signal, so only versions are
// reported — a routine release, a deploy, byte noise and substitution all look
// alike to a hash.
function verifierVersions(dir) {
  const frozen = path.join(dir, 'uvl-verify-snapshot.cjs');
  if (!fs.existsSync(frozen)) return 'no frozen verifier in this draw folder';
  const m = fs.readFileSync(frozen, 'utf8').match(/VERSION\s*=\s*'([^']+)'/);
  return 'frozen v' + (m ? m[1] : '?') + ', current v' + VERSION +
         (m && m[1] !== VERSION ? ' — different versions, which by itself means nothing' : '');
}

function printReport(dir, verdict) {
  console.log('uvl-verify v' + VERSION + ' — spec §17');
  console.log('draw folder: ' + path.resolve(dir));
  console.log('do not take this script\'s word for it: hash it yourself with');
  console.log('  sha256sum "' + __filename + '"      (Windows: Get-FileHash)');
  console.log('  ' + verifierVersions(dir));
  console.log('');
  for (const s of steps) {
    console.log('[' + s.status.padEnd(10) + '] ' + s.n + '. ' + s.title);
    for (const l of s.lines) console.log('             ' + l);
  }
  console.log('');
  console.log(verdict.text);
  console.log('exit code ' + verdict.code);
}

function verdictOf() {
  const mismatch = steps.filter(s => s.status === MISMATCH);
  const unver = steps.filter(s => s.status === UNVERIFIED);
  if (mismatch.length) return { code: 1, text:
    'MISMATCH in step(s) ' + mismatch.map(s => s.n).join(', ') +
    ' — the published result does not follow from the artifacts. This is a real failure.' };
  if (unver.length) return { code: 2, text:
    'NO VERDICT: step(s) ' + unver.map(s => s.n).join(', ') + ' could not be checked. ' +
    'Nothing contradicted anything — but an overall check mark is withheld, ' +
    'because "could not check" is not "checked and fine".' };
  return { code: 0, text: 'VERIFIED: every step reproduced from the published artifacts.' };
}

const USAGE = [
  'uvl-verify v' + VERSION,
  '  node uvl-verify.cjs <draw-folder> [--round-file <file>] [--offline]',
  '',
  '  <draw-folder>   a downloaded draw folder: chain.json, seal.json, dumps/, …',
  '  --round-file    read the drand round from a saved JSON file instead of the',
  '                  network ({ round, randomness, signature }) — offline recompute',
  '  --offline       do not touch the network at all; step 4 reports UNVERIFIED',
  '',
  '  exit 0 all steps OK · 1 mismatch · 2 something could not be checked'
].join('\n');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) { console.log(USAGE); process.exit(args.dir ? 0 : 2); }
  const dir = args.dir;
  if (!fs.existsSync(path.join(dir, 'seal.json'))) {
    console.error('not a sealed draw folder (no seal.json): ' + path.resolve(dir));
    process.exit(2);
  }
  const seal = readJson(path.join(dir, 'seal.json'));
  const chain = fs.existsSync(path.join(dir, 'chain.json'))
    ? readJson(path.join(dir, 'chain.json')) : { links: [] };
  const result = fs.existsSync(path.join(dir, 'result.json'))
    ? readJson(path.join(dir, 'result.json')) : null;

  stepChain(dir, chain, seal);
  stepTickets(dir, seal);
  stepOrder(seal);
  const round = await stepRound(seal, args, result);
  if (round) stepDerive(seal, round, result);
  else report(5, 'winner derivation', UNVERIFIED, 'no usable round — nothing to derive from');

  const verdict = verdictOf();
  printReport(dir, verdict);
  process.exit(verdict.code);
}

main().catch(e => { console.error('uvl-verify crashed: ' + (e && e.stack || e)); process.exit(2); });
