// uvl-merge v0.5 — the weighted ticket policy (spec §16.4).
// TRUST-CHAIN MODULE: like the parser (and unlike the verifier), this code DEFINES
// the ticket list of a weighted draw — so it is snapshotted into the draw folder at
// seal and its hash is recorded in seal.json as part of the proof.
//
// Weighted draw = a main draw that carries a finished rehearsal draw over:
//   rehearsal winner -> weights.winner tickets (3)
//   rehearsal participant -> weights.participant tickets (2)
//   main-post-only -> weights.mainOnly ticket (1)
// Categories are EXCLUSIVE: a rehearsal participant who also commented on the main
// post still holds exactly weights.participant tickets. Silent rehearsal
// participants are carried automatically (both rules confirmed 2026-07-31).
//
// Replicas: every person's tickets are consecutive ids `<url>#1 … <url>#w` — a
// deliberate deviation from uvLs v3, and the reason succession must skip a
// winner's own replicas (successorOf below).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.uvlMerge = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '0.5';
  const person = id => String(id).split('#')[0];

  // mainPersons: [{url}] extracted from the MAIN dump by the parser, dump order.
  // carry: { tickets: [{ticket,url}] — the rehearsal draw's SEALED list (frozen copy),
  //          winnerUrl: rehearsal winner's person url (from its result.json),
  //          weights: {winner, participant, mainOnly} }
  // Order (confirmed): main-dump persons in dump order, then rehearsal-only persons
  // in rehearsal-list order; each person's replicas consecutive.
  function expandWeighted(mainPersons, carry) {
    if (!carry || !carry.weights) throw new Error('weighted policy without carry weights');
    if (!carry.winnerUrl) throw new Error('carry draw has no winner yet — cannot weight');
    const weights = carry.weights;
    const rehearsal = (carry.tickets || []).map(t => person(t.url));
    const rehearsalSet = new Set(rehearsal);
    const weightOf = u => u === carry.winnerUrl ? weights.winner
                    : rehearsalSet.has(u) ? weights.participant
                    : weights.mainOnly;
    const seen = new Set(); const persons = [];
    for (const p of mainPersons) if (!seen.has(p.url)) { seen.add(p.url); persons.push(p.url); }
    for (const u of rehearsal)   if (!seen.has(u))     { seen.add(u);     persons.push(u); }
    const tickets = [];
    for (const u of persons) {
      const w = weightOf(u);
      for (let k = 1; k <= w; k++)
        tickets.push({ ticket: 'TICKET-' + String(tickets.length + 1).padStart(4, '0'),
                       url: u + '#' + k, person: u, weight: w });
    }
    return { version: VERSION, weights: weights,
             persons: persons.length, carried: rehearsal.length, tickets: tickets };
  }

  // §16.4: the prize passes to the next ticket held by a DIFFERENT person.
  // Works for plain draws too (person(url) === url, so this equals order[1]).
  function successorOf(order, winnerId) {
    const w = person(winnerId);
    for (const o of order) if (person(o.id) !== w) return o;
    return null;
  }

  return { VERSION: VERSION, person: person,
           expandWeighted: expandWeighted, successorOf: successorOf };
});
