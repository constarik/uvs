# Operator guide — running verifiable gacha (uvGacha)

*For anyone running a gacha banner, loot box, or card pack. UVS makes every **pull** recomputable by any player; you keep the storefront, the currency, and item delivery. Live: [uvs.uncloned.work/gacha](https://uvs.uncloned.work/gacha). Spec: [`uvGacha.md`](../uvGacha.md).*

---

## The shape of a fair pull

A gacha session is a **deterministic resolver replayed over committed entropy**. Seeds combine into one value; each pull `i` maps to a tier by a pure integer comparison:

```
combinedSeed = SHA-256( serverSeed : clientSeed : drandRandomness )
u_i          = SHA-256( combinedSeed : i ) mod D        // integer in [0, D)
outcome      = the tier whose cumulative interval contains u_i
```

Same inputs → same pulls, on any machine, in any language. There is no population of players — one player pulls repeatedly against a fixed distribution, and `i` is just the (non-reusable) pull index.

## 1 · Define the drop table

- Rates are **integers** over a denominator `D` (e.g. parts-per-million, `D = 1 000 000`) and **MUST sum to exactly D**. No floats — a float rate can flip a boundary between languages and break byte-identical replay.
- Example banner: `5★ = 6000` (0.6%), `4★ = 91000` (9.1%), `3★ = 903000` (90.3%).
- **Pity (optional):** declare it in the rules (e.g. "guarantee 5★ after 90 consecutive misses"). It's reconstructed by replay from pull 1 — never stored. You may declare any deterministic machine (soft pity, 50/50, multi-pull floors); the standard verifies *your declared* machine, it doesn't prescribe one.

## 2 · Choose the mode (this sets the trust tier)

| Mode | What it is | Tier | Use for |
|---|---|---|---|
| **in-browser** | the page resolves locally | 🟡 (demo) | showing the mechanic; grindable, not for production |
| **anchored** | the registrar commits `serverSeed` **before** it sees the player's `clientSeed`, then reveals; record notarized at ×2 RFC-3161 | 🟡 (neutral) | real tap-to-pull |
| **batch** | the whole pull-session binds to a **future drand round** before its randomness exists | 🟢 | announced banners / sealed multi-pulls |

Instant pulls are **🟡 by construction** — binding each tap to a future beacon would cost ~3 s per pull or make outcomes pre-knowable. Only a **batch** reaches 🟢.

## 3 · Pull and publish

Backend endpoints (registrar):

- `POST /gacha/commit` `{ rules, rateDenominator, pullCount }` → `{ sessionId, commitment }` (serverSeed committed, kept private).
- `POST /gacha/reveal` `{ sessionId, clientSeed }` → the record (results + revealed serverSeed + notary). **🟡**
- `POST /gacha/commit-batch` `{ rules, rateDenominator, pullCount, clientSeed, delaySeconds }` → binds to a future round; poll `POST /gacha/reveal { sessionId }` after the round publishes → **🟢** record with the drand value folded in.

**Publish the record** — let the player download it, or share the canonical link `registrar.uncloned.work/gacha/<sessionId>` (the gacha analogue of `/draws/:id`): anyone can fetch and replay it. Any player recomputes it with the reference resolver in JS / Python / Java / C++.

## The honest boundary (publish your odds)

UVS proves the **published odds were the odds applied** and that the pulls follow from the seeds. It does **not** prove the published odds match your marketing or legal claim, or that the advertised item is actually in the pool. Close that by **publishing the drop rates before sales**, not by the hash. Crediting the item to the player's account is your system's job — UVS makes *what was pulled* provable; it doesn't deliver it.

---

*Next: [player guide — gacha](./player-gacha.md) · [operator guide — lottery](./operator-lottery.md) · spec [`uvGacha.md`](../uvGacha.md)*
