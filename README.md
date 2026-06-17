# UVS — Uncloned Verification Standard

**Provably fair by mathematics, not by trust.** A result should be a fact you can recompute, not a promise you have to trust.

**Version 3 · June 2026** · [uncloned.work](https://uncloned.work)

---

UVS is one core primitive — a deterministic, committed, publicly reproducible draw — with three branches. v3 splits the standard into four documents:

```
                       UVS-core  ·  uvs.md
                 the invariant all branches share
     ┌──────────────────┬──────────────────┬──────────────────┐
 uvLottery           uvGame             uvGacha
 uvLs.md             uvGs.md            uvGacha.md
 verifiable draws    interactive games  sequential chance draws
```

### → [**uvLottery Standard** — `uvLs.md`](./uvLs.md) · *the open standard for verifiable draws*
Lotteries, raffles, and allocations (housing, visas, school places, DAO distributions). One seeded permutation anyone can recompute from public data, sealed by a public **drand** round so it can't be pre-picked. **Shipped** — live at [uvs.uncloned.work/draw](https://uvs.uncloned.work/draw), reproduced byte-for-byte by reference verifiers in [JavaScript, Python, Java, and C++](./verifiers).

### → [**uvGame Standard** — `uvGs.md`](./uvGs.md) · *interactive games with a player*
Slots, crash games, physics arcades, multiplayer. ChaCha20 keystream, commit-reveal with a player `clientSeed`, optional Protected layer (per-session WASM + Registrar). Reference: [PADDLA](https://paddla.uncloned.work). Move Sync (real-time multiplayer, signed moves) is a planned profile.

### → [**uvGacha Standard** — `uvGacha.md`](./uvGacha.md) · *sequential chance draws*
Gacha banners, loot boxes, card packs: a sequence of pulls against published drop rates, optionally with stateful pity / guarantee systems. Chance-based like uvLottery, sequential and stateful like uvGame — it reuses the commit-reveal seed chain and proves the published odds were the odds applied. Reference resolver in [JavaScript, Python, Java, and C++](./verifiers) with stateless + hard-pity test vectors. Tier ceiling **🟡** for instant pulls, **🟢** for a batch bound to a future **drand** round. **Live** — pull and recompute at [uvs.uncloned.work/gacha](https://uvs.uncloned.work/gacha).

### → [**UVS-core** — `uvs.md`](./uvs.md) · *the invariant*
Determinism, canonical JSON, the Audit-Trail recipe format, reproducibility, version negotiation, and the derived **trust tiers** (🔴 unanchored / 🟡 notary / 🟢 outcome-bound).

**Full index:** [SPEC.md](./SPEC.md) · **Archives:** [SPEC-v2.md](./SPEC-v2.md) (frozen v2 monolith), [SPEC-v1.md](./SPEC-v1.md).

## Guides

Plain step-by-step — no crypto background needed:

- **Operators** — [run a verifiable draw](./guides/operator-lottery.md) · [run verifiable gacha](./guides/operator-gacha.md)
- **Players** — [check your draw yourself](./guides/player-lottery.md) · [check your pulls yourself](./guides/player-gacha.md)

---

## Verify a draw yourself

A draw is one operation:

```
combinedSeed = SHA-256( serverSeed + ":" + drandRandomness )
score(id)    = SHA-256( combinedSeed + ":" + id )
order        = participants sorted by score DESC      (ties: id ASC)
allocation   = order[i] receives prizes[i]            (null beyond the pool)
```

Four independent reference verifiers reproduce [`verifiers/test-vectors.json`](./verifiers) byte-for-byte — pick the language you trust:

```
node   verifiers/draw-verify.js verifiers/record.json
python verifiers/draw_verify.py verifiers/record.json
javac  verifiers/DrawVerify.java && java -cp verifiers DrawVerify
```

There is no "operator's version" of the result. There is one result, and anyone can compute it.

## Reference implementations

| What | Branch | Link |
|---|---|---|
| Run a draw (live) | uvLottery | [uvs.uncloned.work/draw](https://uvs.uncloned.work/draw) |
| Pull a gacha (live) | uvGacha | [uvs.uncloned.work/gacha](https://uvs.uncloned.work/gacha) |
| PADDLA — physics arcade | uvGame | [paddla.uncloned.work](https://paddla.uncloned.work) |
| Registrar — WASM seed + verify node | uvGame (Protected) | [registrar.uncloned.work](https://registrar.uncloned.work) |
| Gacha resolver (reference, JS / Python / Java / C++) | uvGacha | [verifiers/gacha-resolve.js](./verifiers) |
| SDK — core + uvGame + uvLottery plugins | both | [github.com/constarik/uvs-sdk](https://github.com/constarik/uvs-sdk) |

## License

The UVS specification is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Implementations may use any license.

*Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
