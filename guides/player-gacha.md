# Player guide — check your pulls yourself (uvGacha)

*You pulled a gacha. You don't have to trust the drops — you can **recompute every pull yourself** from public data. Try it live at [uvs.uncloned.work/gacha](https://uvs.uncloned.work/gacha). Spec: [`uvGacha.md`](../uvGacha.md).*

---

## 1 · Get the record

A pull session produces a record containing: the `serverSeed` (revealed after), your `clientSeed`, the `drand` round + randomness (for a 🟢 batch), the `rules` (drop table + any pity), `pullCount`, and the `results`. On [/gacha](https://uvs.uncloned.work/gacha) you can download it; an operator should publish or hand it to you.

## 2 · The 30-second checks

- **Commitment:** `SHA-256(serverSeed)` must equal the `commitment` the operator showed *before* the pull — so the server seed wasn't chosen after the fact.
- **Your seed:** the `clientSeed` is your own contribution. Because you set it *after* the commitment was recorded, and the operator never saw it at commit time, neither side could grind a favourable sequence.
- **Batch (🟢):** if there's a `drand` round, its randomness is public (verify at api.drand.sh) and the commitment was timestamped before that round existed — the whole session was sealed before its outcome could be known.
- **Odds add up:** the drop `rules` rates must sum to exactly the denominator `D`.

## 3 · Recompute the pulls (the real proof)

```
combinedSeed = SHA-256( serverSeed : clientSeed : drandRandomness )   // drandRandomness empty for instant
for each pull i = 1, 2, 3, ...:
    u_i  = SHA-256( combinedSeed : i ) mod D        // integer in [0, D)
    tier = the tier whose cumulative interval (rates in declared order) contains u_i
```

Pity, if any, is **reconstructed by replay**: count consecutive pulls that weren't the pity tier; when the threshold is hit, that pull is forced. Nothing is stored — it's all recomputed from pull 1.

You don't have to code it — run a reference resolver on the record (all four reproduce it byte-for-byte):

```
node   gacha-resolve.js   record.json
python gacha_resolve.py   record.json
java   GachaResolve.java   record.json
```

(Resolvers: [github.com/constarik/uvs/tree/master/verifiers](https://github.com/constarik/uvs/tree/master/verifiers).) If its pulls match your record, the session was honest down to the bit.

## What "5★ / 4★ / 3★" and "pity" mean

The tiers are just **prize grades**, all real items — 3★/4★ aren't "losses", they're lower-value drops. "Pity" is a guarantee rule (e.g. a 5★ by the 90th miss); a "miss" is any pull that isn't the pity tier. None of this is fixed by the standard — it's the operator's declared drop table, which the replay simply reproduces.

## What this guarantees — and what it doesn't

**Guaranteed:** the pulls follow exactly from the seeds and **the published odds were the odds applied** — instant pulls are 🟡, a drand-bound batch is 🟢 (sealed before its outcome existed).

**Not guaranteed by the math:** that the published odds are generous, legal, or match the marketing, or that the advertised item is even in the pool — that's the operator's *published-odds honesty* (closed by publishing odds before sales), and delivery of the item to your account is the operator's system, not the cryptography.

---

*See also: [player guide — lottery](./player-lottery.md) · [operator guide — gacha](./operator-gacha.md)*
