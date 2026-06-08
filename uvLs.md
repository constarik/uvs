# uvLottery Standard — UVS Branch for Verifiable Draws

**Version 3 · June 2026 · Uncloned Math**

Builds on: **UVS-core v3** (`uvs.md`)
Specification: [github.com/constarik/uvs](https://github.com/constarik/uvs) · Site: [uncloned.work](https://uncloned.work)
Run a live draw: [uvs.uncloned.work/draw](https://uvs.uncloned.work/draw) · Reference verifiers: [verifiers/](https://github.com/constarik/uvs/tree/master/verifiers)

---

> **Normative language.** **MUST**, **MUST NOT**, **SHOULD**, **MAY** per RFC 2119.

> **Scope.** uvLottery is the UVS branch for **verifiable draws** — lotteries, raffles, loot-box / gacha pulls, and allocations (housing, visas, school places, DAO distributions). There is **no player and no interactive input**. The operation is: *honestly select from a fixed set according to publicly pre-committed rules.* Where uvGame asks "was this game played fairly?", uvLottery asks "was this draw drawn fairly?"
>
> A draw is **not** a mode of the game protocol: it has no `clientSeed` (the player's randomness contribution is replaced by a public beacon), it scores with SHA-256 (not a ChaCha20 keystream), and public randomness is **mandatory**. These are branch boundaries, not inconsistencies (core §2.1).

> **Status: SHIPPED.** The algorithm below is live at [uvs.uncloned.work/draw](https://uvs.uncloned.work/draw) and is reproduced byte-for-byte by four independent reference verifiers (JavaScript, Python, Java, C++) against published test vectors.

---

## Table of Contents

1. [Inheritance from Core](#1-inheritance-from-core)
2. [The Primitive: One Seeded Permutation](#2-the-primitive-one-seeded-permutation)
3. [Algorithm (normative)](#3-algorithm-normative)
4. [Public Randomness — drand (MUST)](#4-public-randomness--drand-must)
5. [Commitment & Anti-Grinding](#5-commitment--anti-grinding)
6. [The Prize Pool](#6-the-prize-pool)
7. [Record Format](#7-record-format)
8. [Trust Tiers for Draws](#8-trust-tiers-for-draws)
9. [Verification](#9-verification)
10. [Test Vector](#10-test-vector)
11. [Branch Threat Model](#11-branch-threat-model)

---

## 1. Inheritance from Core

uvLottery is a UVS branch and **MUST** satisfy all of UVS-core v3 (`uvs.md`): bit-exact determinism, Canonical JSON for hashed values, the Audit Trail recipe format, independent reproducibility, integer version negotiation, and derivable trust tiers. This document specifies the draw-specific machinery. Where it is silent, the core governs. The header `branch` field is `"uvLottery"`.

---

## 2. The Primitive: One Seeded Permutation

Every draw, raffle, lottery, or loot-box pull is the **same operation**:

> Put the participants in a random order, then deal the published prizes onto that order.

Rank 1 receives the first prize, rank 2 the second, and so on. "Winning a legendary item," "drawing a front-row seat," and "hitting the jackpot" are all the same thing — *where did my entry land in the ordering?* uvLottery makes that ordering a pure, reproducible function of public inputs. There is no hidden state and no private RNG.

---

## 3. Algorithm (normative)

Given a committed `serverSeed`, a `drandRandomness` value (§4), and the committed participant list `participants[]`, an implementation **MUST** compute:

```
combinedSeed = SHA-256( serverSeed + ":" + drandRandomness )

score(id)    = SHA-256( combinedSeed + ":" + id )          // for every participant id

order        = participants sorted by score DESCENDING,
               ties broken by id ASCENDING (lexicographic)

allocation   = order[i] receives prizes[i]                 // null beyond the pool length
```

All hash inputs are UTF-8 byte strings joined by the literal ASCII colon `":"`. All hashes are SHA-256, lowercase hex. Sorting is by the hex string compared as a value (equivalently, by the 256-bit big-endian integer); the tie-break on `id` makes the order total and deterministic.

### 3.1 Single-participant lookup

A participant's result **MUST** be computable without ranking everyone, in O(M) hashing and no sort:

```
me     = score(myId)
higher = count of participants p ≠ myId with  score(p) > me
                                         or ( score(p) == me and p < myId )
rank   = higher + 1
prize  = prizes[rank-1]   if present in the committed list and rank ≤ pool length, else none
```

This is what lets a participant check *only their own number* and get a trustworthy answer.

---

## 4. Public Randomness — drand (MUST)

uvLottery **MUST** draw `drandRandomness` from a public randomness beacon — a [drand](https://drand.love) round operated by the League of Entropy. The operator does not supply the draw's entropy; a neutral, publicly verifiable beacon does. This is the branch's replacement for uvGame's `clientSeed`.

### 4.1 Beacon (reference: quicknet)

```
chainHash = 52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971
period    = 3 seconds
genesis   = 1692803367   (unix)
roundAt(t)      = floor( (t - genesis) / period ) + 1
timeOfRound(r)  = genesis + (r - 1) * period
randomness(r)   = SHA-256( signature_bytes_of_round_r )
endpoints:  https://api.drand.sh/<chainHash>/public/<round>
            https://drand.cloudflare.com/<chainHash>/public/<round>
```

`randomness` **MUST** be taken as the SHA-256 of the round's signature bytes (the beacon's own `randomness` field), and any verifier **MUST** be able to re-fetch the named round and confirm it.

---

## 5. Commitment & Anti-Grinding

The order of operations determines the strength of the guarantee.

### 5.1 The grinding attack

If the entropy used by a draw is already **known** when the operator chooses its seed, the operator can **grind**: try many seeds, compute the winners for each, and publish the one it likes. Reusing already-published randomness does not help — a pool of past beacon values is fully known and therefore grindable. *Unpredictability must come from a value that did not exist at commit time.*

### 5.2 Required commitment flow (outcome-binding)

To make a draw un-grindable, an implementation **MUST**:

1. Publish, **before** the draw, the participant list, the prize pool, and `commitment = SHA-256(serverSeed)`.
2. Commit to a **future** drand round `R` — one whose publication time is *after* the commitment. `R` does not yet exist, so it cannot be pre-selected.
3. After round `R` publishes, fetch `drandRandomness = randomness(R)` and compute the result (§3).
4. Reveal `serverSeed`; anyone checks `SHA-256(serverSeed) == commitment` and re-derives the winners.

Because the outcome depends on `R`, which was unknown at commitment, neither the operator nor anyone else could have steered it. This is **outcome-binding** (the strongest anchor, core §10.2) and is the recommended, default mode for uvLottery.

### 5.3 Notary mode (weaker, permitted)

An implementation **MAY** instead bind a *past or concurrent* round as a **notary** (a timestamp on a finished record). This proves *when* the draw was bound to the public timeline but does **not** prevent grinding. A notary-only draw **MUST NOT** be presented as outcome-bound, and is classified at most 🟡 (§8).

---

## 6. The Prize Pool

The pool is the ordered list of prizes dealt onto the permutation. It **MUST** be committed publicly before the draw (§5.2). Two equivalent declarations:

- **Explicit:** `prizes = ["GRAND", "SECOND", "SECOND", ...]` — `order[i]` receives `prizes[i]`.
- **Count + label:** `winners = N` with a single `prizeLabel` — the top `N` of the order each receive `prizeLabel`.

**Weighting** is expressed by the *composition* of the pool, not by altering scores: a draw where "legendary" is rarer than "common" simply contains fewer `LEGENDARY` entries than `COMMON` entries in `prizes[]`. The selection itself is **content-neutral** — `score(id)` depends only on `combinedSeed` and `id`, never on who the participant is or what prize sits at a rank. This neutrality is what makes non-discrimination checkable: every entry is ranked by the same public function.

---

## 7. Record Format

A uvLottery draw **SHOULD** publish a self-contained record sufficient for any third party to reproduce it. The shipped format:

```json
{
  "uvs":   "verifiable-allocation/v1",
  "model": "gacha | tickets | allocation",
  "rules": {
    "participants": ["TICKET-0001", "..."],
    "idPrefix":     "TICKET-",
    "prizePool":    [ { "tier": "LEGENDARY", "key": "...", "count": 1, "pct": 5 } ],
    "serverSeed":   "<hex, revealed after the round>",
    "drand":        { "beacon": "<chainHash>", "round": 29286636,
                      "randomness": "<hex>", "verifyUrl": "https://api.drand.sh/.../public/29286636" },
    "combinedSeed": "<hex = SHA-256(serverSeed:randomness)>",
    "algorithm":    "rank(id)=SHA-256(combinedSeed:id), sort desc, deal pool onto order"
  },
  "result": [ { "rank": 1, "id": "TICKET-0002", "prize": "SEAT", "score": "<hex>" } ]
}
```

The header (`commitment`, `drand` round, `branch: "uvLottery"`) follows core §6.2; the record is the replayable recipe (core §6.1).

---

## 8. Trust Tiers for Draws

Per core §10, a draw's tier is **derived from evidence**, never claimed:

| Tier | Condition |
|------|-----------|
| 🔴 **Unanchored** | Committed seed + reproducible recipe, but no public beacon binding. |
| 🟡 **Notary** | drand round bound as a timestamp on a finished record (§5.3) — proves *when*, not unriggability. |
| 🟢 **Outcome-bound** | Seed bound to a **future** drand round (§5.2) — the outcome could not be pre-selected. The recommended mode. |

Input honesty (that the participant list and pool were not themselves rigged) is **separate** from the tier and is addressed by the public pre-commitment of those inputs (§5.2, §11).

---

## 9. Verification

A draw is verified — with no privileged access and no trust in the operator — in three steps:

1. **Commitment** — confirm `SHA-256(serverSeed) == commitment` published before the draw.
2. **Randomness** — fetch the named drand round from the public beacon; confirm its `randomness` matches the record and that the round published *after* the commitment (for 🟢).
3. **Re-derivation** — run §3 over the committed `participants[]`; confirm the winners match what was announced.

Four reference verifiers — **JavaScript, Python, Java, C++** — each using only the standard library, each producing byte-identical output, are published in [`verifiers/`](https://github.com/constarik/uvs/tree/master/verifiers) along with test vectors. A reviewer runs whichever they trust, or writes a fifth and checks it against the vectors. There is no "operator's version" of the result: there is one result, and anyone can compute it.

---

## 10. Test Vector

The canonical vector in [`verifiers/test-vectors.json`](https://github.com/constarik/uvs/tree/master/verifiers) — a 20-ticket draw for 5 `SEAT` prizes:

```
serverSeed = a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f70811223344556
drand round = 29286636
randomness  = e8d0543d60b639cf02775d16d8bc66f281b7bcbdf59706f29a1684889f8b9548
participants = TICKET-0001 … TICKET-0020

combinedSeed = 32ca5bd0df3efe8ce416e9a9a4a9f797422eed24b1d0f6b455d915364caeced8
winners      = TICKET-0002 (rank 1), TICKET-0012 (2), TICKET-0001 (3),
               TICKET-0005 (4), TICKET-0006 (5)
```

Every reference verifier, in every language, reproduces these exact winners. Any conforming implementation **MUST** reproduce this vector.

---

## 11. Branch Threat Model

Beyond the shared core threats (`uvs.md` §12), uvLottery specifically prevents and explicitly does not prevent:

**Prevented**

- **Seed substitution** — commitment mismatch is detectable by anyone.
- **Grinding the seed** — outcome-binding to a future drand round (§5.2) means the operator could not search for a favorable seed; the entropy did not exist at commit.
- **Result falsification** — winners are re-derived from public inputs; an altered list no longer matches.
- **Beacon substitution** — the named round is re-fetchable from the public beacon and must match.
- **Hidden bias / discrimination** — scoring is content-neutral (§6); every entry is ranked by the same public function.

**Not prevented (out of crypto scope)**

- **Input dishonesty** — phantom participants, or a published pool that differs from what entrants were promised, will still *verify* mathematically. Guarding inputs requires the participant list and pool to be **publicly committed before** the draw (§5.2); that pre-commitment, not the hash, is what closes this gap.
- **Notary-only weakness** — a draw bound only as a notary (§5.3) is grindable and **MUST NOT** be presented as 🟢.
- **Off-chain identity / eligibility** — who is allowed to hold a ticket (KYC, one-per-person) is the operator's domain, not UVS's.
- **Cryptographic breaks** — inherits the security of SHA-256 and drand.

---

*uvLottery Standard v3 · Uncloned Math · June 2026 · built on UVS-core v3 · [uncloned.work](https://uncloned.work)*

*Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
