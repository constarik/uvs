# uvGacha Standard — UVS Branch for Sequential Chance Draws

**Version 3 · June 2026 · Uncloned Math**

Builds on: **UVS-core v3** (`uvs.md`)
Specification: [github.com/constarik/uvs](https://github.com/constarik/uvs) · Site: [uncloned.work](https://uncloned.work)

---

> **Normative language.** **MUST**, **MUST NOT**, **SHOULD**, **MAY** per RFC 2119.

> **Scope.** uvGacha is the UVS branch for **repeated, chance-based item draws** — gacha banners, loot boxes, card packs, prize machines: a sequence of independent pulls against published drop rates, optionally with stateful pity/guarantee systems. It inherits UVS-core (`uvs.md`).
>
> uvGacha sits **between** the other two branches. Like **uvLottery** (`uvLs.md`) it is **pure chance** — outcomes follow published odds, with no player skill. Like **uvGame** (`uvGs.md`) it is **sequential and stateful** — pulls happen in order and a pull may depend on the history before it — and it reuses uvGame's commit-reveal seed chain. It is therefore **not** a skill game (a draw shaped by player skill belongs to uvGame) and **not** a one-shot allocation (a single seeded permutation of a fixed pool belongs to uvLottery).

> **The discipline of this branch.** A gacha's specific mechanics — drop tables, soft/hard pity, 50/50 featured guarantees, multi-pull floors — are **unbounded** and operator-specific. This standard does **NOT** enumerate them. It fixes the **contract** (a committed, deterministic resolver replayed against committed entropy) and the **properties** that make any such resolver verifiable; particular mechanics live in the operator's committed ruleset and in test vectors, never in normative prose. This mirrors uvGame, which standardizes deterministic replay, not "physics."

---

## Table of Contents

1. [Inheritance & Reuse](#1-inheritance--reuse)
2. [The Contract](#2-the-contract)
3. [Entropy & Anti-Grinding](#3-entropy--anti-grinding)
4. [Per-Pull Resolution (integer odds)](#4-per-pull-resolution-integer-odds)
5. [Stateful Rules (pity, guarantees)](#5-stateful-rules-pity-guarantees--optional)
6. [Trust Tier](#6-trust-tier)
7. [Record & Verification](#7-record--verification)
8. [Branch Threat Model](#8-branch-threat-model)

---

## 1. Inheritance & Reuse

uvGacha is a UVS branch and therefore **MUST** satisfy all of UVS-core v3: bit-exact determinism, Canonical JSON for hashed state (core §5), the Audit Trail recipe format (core §6), independent reproducibility, integer version negotiation, and derivable trust tiers (core §10). The header `branch` field (core §6.2) is `"uvGacha"`.

To stay thin, uvGacha **reuses by reference** machinery already specified in the sibling branches rather than redefining it:

- the **seed commitment, commit-reveal flow, and `clientSeed` contribution** — uvGame §3.1–§3.4;
- the **drand beacon** (quicknet constants, `randomness(r)`, `roundAt`/`timeOfRound`) and the **integer-determinism discipline** — uvLottery §4 and §6.1.

Where this document is silent, the core governs.

## 2. The Contract

A gacha session is a **deterministic resolver** run over committed entropy:

```
resolve( rules, serverSeed, clientSeed, drand, pullCount )  ->  pull[1..pullCount]
```

`rules` is the operator's committed ruleset (drop tables plus any stateful machine, §5). Given identical committed inputs, the sequence of pulls **MUST** be reproducible bit-for-bit by any third party (core §3, §7). Verification is by **replay**: re-run the resolver over the committed recipe and compare to what was published.

The standard's guarantee is exactly this reproducibility. It does **not** opine on whether the published odds are generous — only that **the published odds were the odds applied**.

## 3. Entropy & Anti-Grinding

Per-pull randomness **MUST** derive from a commit-reveal seed chain the operator cannot grind:

```
combinedSeed = SHA-256( serverSeed + ":" + clientSeed + ":" + drandRandomness )
seed_i       = SHA-256( combinedSeed + ":" + i )     // i = pull index, strictly increasing, never reused
```

uvGacha reuses uvGame's commit-reveal **flow** and `clientSeed` contribution, but derives each pull with **SHA-256**, not uvGame's SHA-512/ChaCha20 keystream (§3.2): a gacha needs one comparison digest per pull, not a keystream. Per core §2.1 this digest choice is a **branch boundary, not an inconsistency** — it is exactly the SHA-512-vs-SHA-256 distinction core §2.1 names.

- `serverSeed` is committed (`commitment = SHA-256(serverSeed)`) **before** the session and revealed after (uvGame §3.1, §3.4).
- `clientSeed` is the player's contribution, fixed after the commitment is recorded. Even if the player later learns `serverSeed`, they could not have biased outcomes; and the operator never saw `clientSeed` at commit time, so the operator cannot grind a favourable sequence either — `clientSeed` is fixed only *after* `serverSeed`'s commitment is recorded (uvGame §3.1; uvGame §3.3 states the analogous input-blindness property for input-seeded play).
- `drandRandomness` (uvLottery §4) **MAY** be folded in to add a public, operator-independent value that did not exist at commit time. It is **REQUIRED** only for the 🟢 batch profile (§6).

A pull index **MUST NOT** be reused within a session (core; cf. uvGame `ERR_NONCE_REUSE`).

## 4. Per-Pull Resolution (integer odds)

A pull maps its seed to an outcome through **published drop rates expressed as integers** — never floating-point. A float rate (`0.006`) is not exactly representable and can flip a boundary comparison between languages, breaking byte-identical replay (core §3).

Rates are integers over a declared `rateDenominator` `D` (e.g. parts-per-million, `D = 1000000`; a larger `D` gives finer rates). For pull `i`:

```
u_i     = ( SHA-256(combinedSeed + ":" + i)  as a 256-bit big-endian integer )  mod D    // integer in [0, D)
outcome = the tier whose cumulative integer interval contains u_i
```

Cumulative intervals are built from the tier rates **in their declared order**, and the rates **MUST** sum to exactly `D`. The 256-bit hash-to-integer and the `mod D` **MUST** be computed in arbitrary-precision or sufficient-width integers (the uvLottery §6.1 discipline), so a fixed-width language does not diverge from a big-integer one (core §3). `rateDenominator` and every `rate` **MUST** be JSON integers — no string or coerced value. A verifier **MUST** reject a ruleset whose rates do not sum to exactly `D`; a zero-rate tier is permitted (its interval is empty and can never be drawn). The mapping is a pure integer comparison, identical on every platform. A second integer draw **MAY** select a specific item within the chosen tier (uniform, or weighted by the same integer-threshold method).

## 5. Stateful Rules (pity, guarantees) — OPTIONAL

Many gachas make a pull depend on history: hard pity (a guaranteed rare after N misses), soft pity (rates ramp after a threshold), 50/50 featured guarantees, multi-pull floors. uvGacha does **not** define these individually. It requires only that any such rule be:

1. **Declared in the committed `rules`** (parameters, tables, thresholds) — so it is fixed before the outcome and is part of the commitment; and
2. **A deterministic function of the prior pulls in the session**, evaluated in a **declared order** — so replay reconstructs the same state and therefore the same outcomes.

Given (1) and (2), a stateful resolver is exactly as reproducible as a stateless one. Replay **reconstructs** all intermediate state (pity counters, guarantee flags) from pull 1 — that state is **not** stored or trusted, only recomputed (the recipe principle, core §6.1) — and the evaluation order is part of the committed `rules`, so it cannot change after the outcome. Concrete machines (a soft-pity ramp, a 50/50 flag) are supplied as **test vectors** (§7), not as normative requirements: the standard verifies the operator's *declared* machine, it does not prescribe one. This is the same discipline as uvGame — replay is standardized, the engine is not.

## 6. Trust Tier

Per `deriveTier` (core §10), a gacha session is classified by the strongest **verified** anchor it actually carries.

- **Instant pulls (tap-to-pull).** Per-pull entropy comes from `serverSeed:clientSeed` (commit-reveal + input-seeding). This is grinding-resistant through the `clientSeed` (uvGame §3.3) but is **not** outcome-bound to a public future beacon — binding each instant pull to a future drand round would either cost ~3 s per pull or make outcomes pre-knowable the moment the round publishes. Honest ceiling: **🟡** — for the same structural reason as uvGame's instant play (per-pull entropy is fixed at commit, with no public future beacon per pull), bearing in mind a gacha pull is a sampling step, not a skill Move.
- **Batch / scheduled pulls.** A whole pull-session (a timed banner, a sealed multi-pull) **MAY** bind its `sessionEntropy` to a **future** drand round before the seed is knowable, with the commitment's prior existence proven per uvLottery §5.4. A **single** session commitment covers all the session's pulls — every pull's `combinedSeed` folds in that session's `drandRandomness` — so one future-round binding lifts the whole pull-session to **outcome-bound → 🟢**. (uvGame §3.6 is a RECOMMENDED session-binding profile; uvGacha applies it at the pull-session level.) Suits banners announced ahead of time; not tap-to-pull.

The Protected/WASM layer (uvGame §5), if used, contributes **nothing** to the tier (core §10): it defends operator IP, not player verification.

## 7. Record & Verification

A uvGacha record is the replayable recipe (core §6.1), under the core header with `branch: "uvGacha"`:

```json
{
  "commitment":      "<SHA-256(serverSeed)>",
  "serverSeed":      "<hex, revealed after the session>",
  "clientSeed":      "<player contribution>",
  "drand":           { "round": 0, "randomness": "<hex>" },     // present for the 🟢 batch profile
  "rateDenominator": 1000000,
  "rules":           { "tiers": [ { "tier": "5star", "rate": 6000 }, { "tier": "4star", "rate": 91000 }, { "tier": "3star", "rate": 903000 } ], "pity": {} },
  "pullCount":       10,
  "results":         [ { "i": 1, "tier": "3star", "item": "..." } ]
}
```

The core §6.2 header (`type`, `uvsVersion`, `branch: "uvGacha"`, `commitment`, `params`) is the **enclosing envelope**; the fields above are the recipe it carries (core §6.1), not a place its header fields are duplicated. `rules` (including any pity tables) is hashed under Canonical JSON (core §5).

A verifier, with no privileged access:

1. confirms `SHA-256(serverSeed) == commitment`;
2. rebuilds `combinedSeed`, replays `resolve(rules, …, pullCount)`, and confirms `results[]` matches bit-for-bit (including any stateful pity evaluated in declared order);
3. for a 🟢 batch record, verifies the §5.4 commit-time anchor and the future-round binding (uvLottery §5.4.1).

A reference resolver in **JavaScript, Python, Java, and C++** (`gacha-resolve.js`, `gacha_resolve.py`, `GachaResolve.java`, `gacha_resolve.cpp`) and gacha test vectors — a stateless drop-table vector, a hard-pity vector, and a rates-do-not-sum-to-`D` negative — are published in [`verifiers/`](https://github.com/constarik/uvs/tree/master/verifiers); all four reproduce the vectors byte-for-byte.

## 8. Branch Threat Model

**Prevented**

- **Seed grinding** — the `clientSeed` (which the operator never saw at commit) plus the optional future-round binding mean the operator cannot search seeds for a favourable pull sequence.
- **Drop-rate substitution** — rates live in the committed `rules` and are hashed; an altered table no longer matches the commitment.
- **Outcome falsification** — pulls are replayed from public inputs; an altered result no longer reproduces.
- **Silent pity tampering** — pity parameters are in the committed ruleset; changing them after the fact fails the commitment.

**Not prevented (out of crypto scope)**

- **Odds honesty** — uvGacha proves the **published** odds were applied; it does **not** prove the published odds match a legal/marketing claim, or that the advertised item is actually in the pool. This is the input-honesty boundary (uvLottery §11), closed by publishing the odds before sales, not by the hash.
- **Display / channel** — what the player is shown at pull time, and whether they reach the genuine record, are the WYSIWYS residuals of uvLottery §5.5: cryptography makes the truth recomputable, it cannot force the player to it.
- **Instant-pull binding** — instant pulls are 🟡 by construction (§6); only the batch profile reaches 🟢.
- **Cryptographic breaks** — inherits the security of SHA-256 and drand.

---

*uvGacha Standard v3 · Uncloned Math · June 2026 · built on UVS-core v3 · [uncloned.work](https://uncloned.work)*

*Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
