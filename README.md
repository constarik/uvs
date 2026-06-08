# UVS — Uncloned Verification Standard

**Provably fair by mathematics, not by trust.** A result should be a fact you can recompute, not a promise you have to trust.

**Version 3 · June 2026** · [uncloned.work](https://uncloned.work)

---

UVS is one core primitive — a deterministic, committed, publicly reproducible draw — with two branches. v3 splits the standard into three documents:

```
                 UVS-core  ·  uvs.md
             the invariant both branches share
        ┌──────────────────┴──────────────────┐
   uvLottery · uvLs.md              uvGame · uvGs.md
   verifiable draws                 interactive games
```

### → [**uvLottery Standard** — `uvLs.md`](./uvLs.md) · *the open standard for verifiable draws*
Lotteries, raffles, gacha / loot-box pulls, and allocations (housing, visas, school places, DAO distributions). One seeded permutation anyone can recompute from public data, sealed by a public **drand** round so it can't be pre-picked. **Shipped** — live at [uvs.uncloned.work/draw](https://uvs.uncloned.work/draw), reproduced byte-for-byte by reference verifiers in [JavaScript, Python, Java, and C++](./verifiers).

### → [**uvGame Standard** — `uvGs.md`](./uvGs.md) · *interactive games with a player*
Slots, crash games, physics arcades, multiplayer. ChaCha20 keystream, commit-reveal with a player `clientSeed`, optional Protected layer (per-session WASM + Registrar). Reference: [PADDLA](https://paddla.uncloned.work). Move Sync (real-time multiplayer, signed moves) is a planned profile.

### → [**UVS-core** — `uvs.md`](./uvs.md) · *the invariant*
Determinism, canonical JSON, the Audit-Trail recipe format, reproducibility, version negotiation, and the derived **trust tiers** (🔴 unanchored / 🟡 notary / 🟢 outcome-bound).

**Full index:** [SPEC.md](./SPEC.md) · **Archives:** [SPEC-v2.md](./SPEC-v2.md) (frozen v2 monolith), [SPEC-v1.md](./SPEC-v1.md).

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
| PADDLA — physics arcade | uvGame | [paddla.uncloned.work](https://paddla.uncloned.work) |
| Registrar — WASM seed + verify node | uvGame (Protected) | [registrar.uncloned.work](https://registrar.uncloned.work) |
| SDK — core + uvGame + uvLottery plugins | both | [github.com/constarik/uvs-sdk](https://github.com/constarik/uvs-sdk) |

## License

The UVS specification is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Implementations may use any license.

*Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
