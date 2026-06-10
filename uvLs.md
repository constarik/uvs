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
12. [Verification & Falsifiability](#12-verification--falsifiability)

---

## 1. Inheritance from Core

uvLottery is a UVS branch and **MUST** satisfy all of UVS-core v3 (`uvs.md`): bit-exact determinism, Canonical JSON for hashed values, the Audit Trail recipe format, independent reproducibility, integer version negotiation, and derivable trust tiers. This document specifies the draw-specific machinery. Where it is silent, the core governs. The header `branch` field is `"uvLottery"`.

---

## 2. The Primitive: One Seeded Permutation

Every draw, raffle, lottery, or loot-box pull is the **same operation**:

> Put the participants in a random order, then deal the published prizes onto that order.

Rank 1 receives the first prize, rank 2 the second, and so on. "Winning a legendary item," "drawing a front-row seat," and "hitting the jackpot" are all the same thing — *where did my entry land in the ordering?* uvLottery makes that ordering a pure, reproducible function of public inputs. There is no hidden state and no private RNG.

> **Why this matters — a public draw is not automatically a fair one.** On 1 December 1969 the US draft lottery was performed live on television, capsules drawn by hand from a glass drum — the very theatre of fairness. It was still biased: the capsules were loaded month-by-month and under-mixed, so late-year birthdates drew systematically worse numbers, and only post-hoc statistics caught it. uvLottery replaces the drum with a permutation that is **uniform by construction** *and* **recomputable by anyone** — the two things the drum could not guarantee.

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

### 3.1 Participant ids (uniqueness, encoding)

Participant ids **MUST** be unique within a draw. A record containing duplicate ids is **invalid**, and a verifier **MUST** reject it rather than rank it — with duplicates, the `id` tie-break no longer yields a total order, and two entries would collide on the same score.

Ids are arbitrary non-empty UTF-8 strings, **NFC-normalized** (core §5) before hashing and before the tie-break comparison; the tie-break compares ids by Unicode code point. Note that the `":"`-joined preimages above are unambiguous by construction: `serverSeed`, `drandRandomness`, and `combinedSeed` are fixed-length lowercase hex, so the variable-length `id` always occupies an unambiguous final position. Ids **MAY** therefore contain `":"` without creating collisions.

### 3.2 Single-participant lookup

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

### 4.2 Beacon failure and chain migration

A commitment names a specific `chainHash` and a specific round `R`. Relays are interchangeable; the chain is not:

- **Relay outage.** Implementations **SHOULD** query multiple relays (api.drand.sh, drand.cloudflare.com, self-hosted mirrors). The round's BLS signature verifies against the chain's published public key regardless of which relay served it, so relay choice carries no trust.
- **Chain halt or retirement.** If the named chain stops publishing before round `R` exists, the draw **MUST NOT** silently substitute another entropy source — that would reopen grinding. The operator **MUST** declare the original record **VOID-BY-BEACON** and publish a *fresh* commitment (new `serverSeed`, new future round on the successor chain, same committed participants and pool), explicitly referencing the voided record. Verifiers **MUST** treat a record whose named round never published as void, not as failed or substitutable.
- **Pinning.** The `chainHash` (and chain public key, if recorded) in the commitment is authoritative; a record verified against any other chain does not verify.

---

## 5. Commitment & Anti-Grinding

The order of operations determines the strength of the guarantee.

### 5.1 The grinding attack

If the entropy used by a draw is already **known** when the operator chooses its seed, the operator can **grind**: try many seeds, compute the winners for each, and publish the one it likes. Reusing already-published randomness does not help — a pool of past beacon values is fully known and therefore grindable. *Unpredictability must come from a value that did not exist at commit time.*

### 5.2 Required commitment flow (outcome-binding)

To make a draw un-grindable, an implementation **MUST**:

1. Publish, **before** the draw, the participant list, the prize pool, `commitment = SHA-256(serverSeed)`, and the target round `R`.
2. Commit to a **future** drand round `R` — one whose publication time is *after* the commitment. `R` does not yet exist, so it cannot be pre-selected.
3. Anchor the commitment record's existence-before-`R` per §5.4.
4. After round `R` publishes, fetch `drandRandomness = randomness(R)` and compute the result (§3).
5. Reveal `serverSeed`; anyone checks `SHA-256(serverSeed) == commitment` and re-derives the winners.

Because the outcome depends on `R`, which was unknown at commitment, neither the operator nor anyone else could have steered it. This is **outcome-binding** (the strongest anchor, core §10.2) and is the recommended, default mode for uvLottery.

### 5.3 Notary mode (weaker, permitted)

An implementation **MAY** instead bind a *past or concurrent* round as a **notary** (a timestamp on a finished record). This proves *when* the draw was bound to the public timeline but does **not** prevent grinding. A notary-only draw **MUST NOT** be presented as outcome-bound, and is classified at most 🟡 (§8).

### 5.4 Proving the commitment came first (MUST for 🟢)

Outcome-binding rests entirely on the premise that the commitment existed **before** round `R` published. A commitment hosted only on the operator's own infrastructure proves nothing about *when* it appeared: a dishonest operator could wait for `randomness(R)`, grind a favorable `serverSeed`, and backdate the page. The future round defeats grinding only if the commitment's priority is itself provable.

Define the **commitment record** as the Canonical JSON (core §5) of `{ participants, prizePool, commitment, chainHash, round R }`, and `commitmentHash = SHA-256(commitment record)`.

For a draw to classify 🟢, `commitmentHash` **MUST** carry evidence of existence before `timeOfRound(R)` that does not depend on trusting the operator. Acceptable evidence — any one of:

- **Append-only public medium.** Inclusion of `commitmentHash` in a public transparency log, a public blockchain transaction, or an OpenTimestamps proof, at a position whose time is verifiably before `timeOfRound(R)`.
- **Neutral registry.** A signature over `commitmentHash` by a published neutral-registry key (core §10.1) together with a signed timestamp before `timeOfRound(R)`, where the registry's signing log is itself publicly auditable.

In addition, the commitment record **SHOULD** embed `randomness(R_c)` of a recent **past** round `R_c < R`. This pins a *lower* bound — the record cannot predate `R_c`'s publication — and narrows the window `[timeOfRound(R_c), timeOfRound(R)]` inside which an auditor must place the anchor. The lower bound alone is **not** sufficient evidence: it proves the record is not too old, not that it is old enough.

A draw whose commitment time rests solely on the operator's word **MUST NOT** be classified 🟢; it is at most 🟡, regardless of the future round named in it.

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
  "commitmentAnchor": {
    "commitmentHash": "<hex = SHA-256(canonical commitment record)>",
    "kind":  "transparency-log | blockchain | opentimestamps | neutral-registry",
    "proof": "<inclusion proof / txid / ots / signature+timestamp>",
    "lowerBoundRound": 29280000
  },
  "result": [ { "rank": 1, "id": "TICKET-0002", "prize": "SEAT", "score": "<hex>" } ]
}
```

The header (`commitment`, `drand` round, `branch: "uvLottery"`) follows core §6.2; the record is the replayable recipe (core §6.1). `commitmentAnchor` carries the §5.4 evidence and is **REQUIRED** for a record claiming 🟢 (`lowerBoundRound` is the optional `R_c`).

> **Two version axes — don't conflate them.** The `verifiable-allocation/v1` tag versions the **record schema** (the JSON shape) and evolves independently of the standard: a `/v1` record is the current shape produced under uvLottery Standard **v3**. The standard version travels in the header as `uvsVersion: 3` (core §6.2), not in this field.

---

## 8. Trust Tiers for Draws

Per core §10, a draw's tier is **derived from evidence**, never claimed:

| Tier | Condition |
|------|-----------|
| 🔴 **Unanchored** | Committed seed + reproducible recipe, but no public beacon binding. |
| 🟡 **Notary** | drand round bound as a timestamp on a finished record (§5.3) — proves *when*, not unriggability. Also: any draw naming a future round whose commitment-time evidence (§5.4) is missing or fails to verify. |
| 🟢 **Outcome-bound** | Seed bound to a **future** drand round (§5.2) **and** the commitment's existence before that round proven per §5.4. The recommended mode. |

Input honesty (that the participant list and pool were not themselves rigged) is **separate** from the tier and is addressed by the public pre-commitment of those inputs (§5.2, §11).

---

## 9. Verification

A draw is verified — with no privileged access and no trust in the operator — in four steps:

1. **Commitment** — confirm `SHA-256(serverSeed) == commitment`, and that the committed record (participants, pool, round `R`) hashes to the published `commitmentHash`.
2. **Commitment time** — verify the §5.4 anchor: confirm `commitmentHash` is included in the named public medium (or carries a valid neutral-registry signature) at a time before `timeOfRound(R)`. The operator's own claimed timestamp is **not** evidence. Without this step the draw verifies at most 🟡.
3. **Randomness** — fetch the named drand round from the public beacon; confirm its `randomness` matches the record.
4. **Re-derivation** — confirm `participants[]` contains no duplicate ids (§3.1), run §3 over the committed list, and confirm the winners match what was announced.

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

Every reference verifier, in every language, reproduces these exact winners. Any conforming implementation **MUST** reproduce this vector. A conforming verifier **MUST** additionally reject the negative vector `duplicate-ids` (the same list with `TICKET-0007` repeated), per §3.1.

---

## 11. Branch Threat Model

Beyond the shared core threats (`uvs.md` §12), uvLottery specifically prevents and explicitly does not prevent:

**Prevented**

- **Seed substitution** — commitment mismatch is detectable by anyone.
- **Grinding the seed** — outcome-binding to a future drand round (§5.2) means the operator could not search for a favorable seed; the entropy did not exist at commit.
- **Backdated commitment** — §5.4 requires operator-independent evidence that the commitment preceded round `R`; a fabricated "early" commitment fails the anchor check and demotes the draw to 🟡.
- **Result falsification** — winners are re-derived from public inputs; an altered list no longer matches.
- **Beacon substitution** — the named round is re-fetchable from the public beacon and must match; chain substitution is excluded by the pinned `chainHash` (§4.2).
- **Hidden bias / discrimination** — scoring is content-neutral (§6); every entry is ranked by the same public function.

**Not prevented (out of crypto scope)**

- **Input dishonesty** — phantom participants, or a published pool that differs from what entrants were promised, will still *verify* mathematically. Guarding inputs requires the participant list and pool to be **publicly committed before** the draw (§5.2); that pre-commitment, not the hash, is what closes this gap.
- **Notary-only weakness** — a draw bound only as a notary (§5.3) is grindable and **MUST NOT** be presented as 🟢.
- **Off-chain identity / eligibility** — who is allowed to hold a ticket (KYC, one-per-person) is the operator's domain, not UVS's.
- **Cryptographic breaks** — inherits the security of SHA-256 and drand.

---

## 12. Verification & Falsifiability

UVS makes a small set of **specific, falsifiable claims**. Each is stated below with **exactly what would disprove it** and the **public inputs** needed to try. There is no bounty and no challenge framing — this is the ordinary posture of a cryptographic claim: confidence expressed as a standing invitation to refute. Every input required to attempt a refutation is public, and none of it requires permission from, or contact with, the operator.

| # | Claim | What would falsify it | Public inputs to check it |
|---|-------|-----------------------|---------------------------|
| 1 | **One result.** The published inputs yield exactly one winner order. | Produce two different valid winner lists from the same `serverSeed`, `drandRandomness`, `participants`, and pool. | the record + any reference verifier |
| 2 | **Faithful ranking.** Every entry's rank is the published function of its id. | Find a participant whose recomputed `rank` ≠ the announced rank. | `participants[]` + `combinedSeed` |
| 3 | **Commitment integrity.** The revealed seed is the one committed before the draw. | Show `SHA-256(serverSeed)` ≠ the pre-published `commitment`. | `commitment` + revealed `serverSeed` |
| 4 | **Beacon authenticity.** The randomness is the named drand round's. | Re-fetch the round from the public beacon; show its randomness ≠ the record's. | drand `round` number + public beacon |
| 5 | **Un-grindability (🟢 draws).** The round published *after* the commit, so the seed could not be pre-picked. | Show `timeOfRound(round) ≤ commitTime` — the round already existed at commit (commit time as **proven** by the §5.4 anchor, not as claimed by the operator). | §5.4 anchor evidence + `genesis + (round−1)·3s` |
| 6 | **Cross-language identity.** All four reference verifiers agree byte-for-byte. | Get any two of JS / Python / Java / C++ to disagree on the same record. | the [verifiers](https://github.com/constarik/uvs/tree/master/verifiers) + a record |

If any single row can be satisfied against a published draw, that draw is broken — provably, by anyone, permanently. That is the design intent: the standard is built to be refuted, and earns trust only by surviving the attempt.

**What is *not* claimed** (so refutation is aimed honestly): UVS does not claim the *inputs* were honest — a rigged participant list, or a pool that differs from what entrants were promised, will still verify (§11). It does not claim a **notary**-only draw is un-grindable (§5.3, §8). It inherits the security of SHA-256 and drand. Those gaps are caught not by the algorithm but by the **public pre-commitment of inputs** (§5.2) and the audit trail — that is their job, not this one.

---

*uvLottery Standard v3 · Uncloned Math · June 2026 · built on UVS-core v3 · [uncloned.work](https://uncloned.work)*

*Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
