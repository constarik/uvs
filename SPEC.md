# UVS — Uncloned Verification Standard

**Version 3 · June 2026 · Uncloned Math** · [uncloned.work](https://uncloned.work)

> *Provably fair by mathematics, not by trust. A result should be a fact you can recompute, not a promise you have to trust.*

UVS v3 is **one core primitive with two branches**. Instead of a single monolith, the standard is three documents:

```
            UVS-core  ·  uvs.md
        the invariant both branches share
        ┌──────────────────┴──────────────────┐
   uvLottery · uvLs.md              uvGame · uvGs.md
   verifiable draws                 interactive games
```

## The documents

### → [**uvLottery Standard** — `uvLs.md`](./uvLs.md)  ·  *the open standard for verifiable draws*

Lotteries, raffles, loot-box / gacha pulls, and allocations (housing, visas, school places, DAO distributions). **No player** — honestly select from a fixed set by publicly pre-committed rules. One seeded permutation: `SHA-256(serverSeed : drandRandomness)` → rank every entry → deal the published pool onto that order. Public randomness (**drand**) is mandatory; binding to a *future* round makes the draw un-grindable. **Shipped** — live at [uvs.uncloned.work/draw](https://uvs.uncloned.work/draw), reproduced byte-for-byte by reference verifiers in [JavaScript, Python, Java, and C++](https://github.com/constarik/uvs/tree/master/verifiers).

### → [**uvGame Standard** — `uvGs.md`](./uvGs.md)  ·  *interactive games with a player*

Slots, crash games, physics arcades, multiplayer. Stateless and Move **Batch** are shipped (reference: [PADDLA](https://paddla.uncloned.work)); Move **Sync** (real-time multiplayer with mandatory signatures) is a planned profile. ChaCha20 keystream, commit-reveal with a player `clientSeed`, optional Protected layer (per-session WASM + Registrar).

### → [**UVS-core** — `uvs.md`](./uvs.md)  ·  *the invariant*

What both branches share: bit-exact determinism, Canonical JSON, the Audit Trail recipe format, independent reproducibility, version negotiation, drand-as-trail-notary, and the derived **trust tiers** (🔴 unanchored / 🟡 notary / 🟢 outcome-bound).

## Archives

- [`SPEC-v2.md`](./SPEC-v2.md) — the frozen v2 monolith (still valid for existing deployments).
- [`SPEC-v1.md`](./SPEC-v1.md) — the original v1 core protocol.
- [`DESIGN_NOTES_uvGame_sync.md`](./DESIGN_NOTES_uvGame_sync.md) — working draft for the planned uvGame Move Sync profile.

---

*UVS v3 · Uncloned Math · June 2026 · [uncloned.work](https://uncloned.work) · Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
