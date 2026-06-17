# Player guide — check the draw yourself (uvLottery)

*You entered a draw. You don't have to trust that it was fair — you can **recompute the winners yourself** from public data. Here's how. Spec: [`uvLs.md`](../uvLs.md).*

---

## 1 · Find the record

Your ticket carries a **drawId**. After the draw, the full record is public at:

```
registrar.uncloned.work/draws/<drawId>
```

It's self-contained — it has everything needed to reproduce the result: the `serverSeed` (revealed after the draw), the `drand` round + randomness, the **participant list**, the **rules** (prize pool), and the **winners**.

## 2 · The 30-second checks

- **Are you in the list?** Search the `participants` for your ticket id. If your paid ticket isn't there, that's a red flag — raise it. (UVS proves the math on the *published* list; it can't know about an entry the operator left out.)
- **Did your draw actually run?** Check the public ledger [uvs.uncloned.work/opens](https://uvs.uncloned.work/opens): your drawId should be **closed**, not stuck "open/abandoned".
- **Was the randomness real?** The record's `drand` has a `verifyUrl` (api.drand.sh) — that round's randomness is public and signed by the drand network, not by the operator.
- **Couldn't it be rigged?** The commitment was timestamped (RFC-3161) *before* the drand round existed (`genTime < roundTime`). The operator fixed the seed before the randomness was knowable — nothing to grind.

## 3 · Recompute the winners (the real proof)

The whole draw is four lines:

```
combinedSeed = SHA-256( serverSeed : drandRandomness )
score(id)    = SHA-256( combinedSeed : id )        // for every entrant
order        = entrants sorted by score, descending (ties: id ascending)
winners      = the prize pool dealt onto that order, top-down
```

You don't have to code it — run one of the four reference verifiers on the record (pick the language you trust; they all reproduce it byte-for-byte):

```
node   draw-verify.js   record.json
python draw_verify.py   record.json
java   DrawVerify.java   record.json
```

(Verifiers: [github.com/constarik/uvs/tree/master/verifiers](https://github.com/constarik/uvs/tree/master/verifiers).) If the winners it computes match the published winners, the draw was honest. If they don't, you have proof it wasn't.

## What this guarantees — and what it doesn't

**Guaranteed:** the published winners follow exactly from the published list, the committed seed, and the public randomness — and the seed was locked before the randomness existed. No "operator's version" of the result exists; there's one result and you just computed it.

**Not guaranteed by the math:** that the entrant list is complete and honest (so check your own id is in it), and anything about payouts, eligibility, or licensing — those are the operator's and the regulator's job, not the cryptography's.

---

*See also: [player guide — gacha](./player-gacha.md) · [operator guide — lottery](./operator-lottery.md)*
