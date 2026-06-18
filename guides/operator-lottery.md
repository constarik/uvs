# Operator guide — running a verifiable draw (uvLottery)

*For anyone running a raffle, prize draw, or allocation. UVS makes the **outcome** recomputable by anyone; you keep the sale, the funds, and the licence. Live console: [uvs.uncloned.work/lottery](https://uvs.uncloned.work/lottery). Spec: [`uvLs.md`](../uvLs.md).*

---

## The shape of a fair draw

A draw is **one seeded permutation**: a server seed is hashed with a public **drand** randomness round, every entry is scored, the list is sorted, and the published prize pool is dealt top-down. Same inputs → same winners, on any machine. The trick that makes it un-riggable: the outcome is bound to a **future** drand round whose randomness does not exist when the seed is committed, and the commitment is timestamped at two independent RFC-3161 authorities *before* that round — so nobody, including you, could have known or steered the result.

## Two phases

### Phase 1 — Open (before you sell anything)

On [/lottery](https://uvs.uncloned.work/lottery), card ①:

1. **Add your prize tiers.** Each tier is either a fixed number of winners, a **percent of entrants**, or **1-in-N** (the last two auto-scale to however many tickets actually sell — uvLs §6.1).
2. **Label** the draw (shown to entrants).
3. **Closing terms — required.** Either a **closes-by date**, or **open-ended** with an optional condition (e.g. "draws when 1000 tickets sell"). This is stamped into the rules and printed on the ticket. No silent draws.
4. Click **Open**. You get a **drawId**, and the prize rules are timestamped at ×2 RFC-3161 *before any ticket is sold* — so you can't change the prizes after seeing who entered.

**Print the drawId on every ticket** (plus the verify link). Sell however you normally do — UVS never touches the money.

### Phase 2 — Close & draw (when sales end)

On [/lottery](https://uvs.uncloned.work/lottery), card ②:

1. Paste your **sold-ticket list** — one id per line, a comma list, a CSV (id = first column), or fetch it from a URL. Duplicates/blanks/junk are flagged.
2. Enter **how many tickets you sold**. This is a *blind* cross-check against your list: the page says only ✓ matches / ✗ doesn't — never the direction or size of any gap — so you must reconcile your billing and your list independently.
3. Pick when to reveal (instant ~3 s, or scheduled).
4. Click **Close & draw**. The backend commits a server seed, binds it to a future drand round, and reveals on its own.

You get a public, self-contained record (keyed by drawId) and the winners.

## What to hand your entrants

- The **drawId** (already on their ticket).
- The **record URL**: `registrar.uncloned.work/draws/<drawId>` — fully self-contained and recomputable.
- Optionally a printable **public-offer + result document**: [uvs.uncloned.work/doc/?drawId=…](https://uvs.uncloned.work/doc/) (you fill in your organisation; UVS supplies the verifiable facts).
- The **public opened-draws ledger** [uvs.uncloned.work/opens](https://uvs.uncloned.work/opens) — every draw you open is listed there.

## What protects honest operation

- Prizes **frozen and timestamped before sales** (§5.5).
- **One draw per drawId** — re-closing is refused, so you can't quietly re-roll.
- **Public opened-draws ledger** — a draw you open but never close shows up as a visible anomaly, so "open many, publish one" doesn't work.
- **Look-alike / count cross-checks** catch honest list mistakes before you draw.

## The honest boundary (say it to entrants up front)

UVS proves the **published winners follow from the published entrant list, under the committed rules, using the public randomness**. It does **not** prove your entrant list is complete or honest — a dishonest operator could still add phantom entries or drop a real one. That input-honesty gap is closed by **publishing the list (or its commitment) before the draw** so entrants can see their own id, not by the hash. Licensing, tax, KYC, and paying out are yours.

---

*Next: [player guide — lottery](./player-lottery.md) · [operator guide — gacha](./operator-gacha.md) · spec [`uvLs.md`](../uvLs.md)*
