// uvl-parser v0.1 — turns a captured LinkedIn thread (dump.html) into the ticket list.
// Protocol artifact (spec §4–§6): published before seal, snapshotted per draw, never
// modified after. Deterministic, dependency-free, same code in browser and Node.
//
// Pipeline: anchors → author URLs (document order) → normalize → dedupe → tickets.
// Anchor (verified 2026-07-26): id="replaceableComment_urn:li:comment:(…)".
// Obfuscated class names are build-specific and are deliberately never used.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.uvlParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '0.1';
  const ANCHOR = 'id="replaceableComment_urn:li:comment:(';

  // §5 — canonical form `linkedin.com/in/<slug>` or null if not a person profile.
  function normalizeUrl(raw) {
    if (!raw) return null;
    let u = String(raw).trim();
    u = u.replace(/^https?:\/\//i, '');            // scheme
    u = u.split('#')[0].split('?')[0];             // fragment, query
    u = u.replace(/^www\./i, '');                  // www.
    u = u.replace(/^[a-z]{2,3}\.linkedin\.com/i, 'linkedin.com'); // locale subdomains
    if (!/^linkedin\.com\//i.test(u)) return null;
    u = u.replace(/^linkedin\.com\/mwlite\/in\//i, 'linkedin.com/in/'); // mobile
    const m = u.match(/^linkedin\.com\/in\/([^\/]+)/i);   // path tail: keep /in/<slug>
    if (!m) return null;                           // company pages etc. drop out
    const slug = decodeURIComponent(m[1]).toLowerCase().replace(/\/+$/, '');
    if (!slug) return null;
    return 'linkedin.com/in/' + slug;
  }

  // dump.html → raw entries, document order. One entry per comment entity.
  function parseDump(html) {
    const entries = [];
    let pos = html.indexOf(ANCHOR);
    while (pos !== -1) {
      const next = html.indexOf(ANCHOR, pos + ANCHOR.length);
      const urnEnd = html.indexOf(')"', pos);
      const urn = html.slice(pos + 4, urnEnd + 1); // between id=" and closing "
      const slice = html.slice(pos, next === -1 ? html.length : next);
      // author = first /in/ href inside the entity (spec §4)
      const a = slice.match(/href="(https?:\/\/[^"]*linkedin\.com\/(?:mwlite\/)?in\/[^"]+)"/i);
      entries.push({ urn: urn, rawUrl: a ? a[1] : null, url: a ? normalizeUrl(a[1]) : null });
      pos = next;
    }
    return entries;
  }

  // Full §6 pipeline. exclude: array of canonical URLs (the organizer, spec §1).
  function buildTickets(html, opts) {
    const exclude = new Set(((opts && opts.exclude) || []).map(normalizeUrl).filter(Boolean));
    const entries = parseDump(html);
    const seen = new Set();
    const tickets = [];
    for (const e of entries) {
      if (!e.url) continue;                 // company pages, composer boxes
      if (exclude.has(e.url)) continue;     // organizer
      if (seen.has(e.url)) continue;        // dedupe, first occurrence wins
      seen.add(e.url);
      tickets.push({ ticket: 'TICKET-' + String(tickets.length + 1).padStart(4, '0'), url: e.url });
    }
    return { version: VERSION, entriesTotal: entries.length, tickets: tickets };
  }

  return { VERSION: VERSION, normalizeUrl: normalizeUrl, parseDump: parseDump, buildTickets: buildTickets };
});
