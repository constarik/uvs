# UVS-core — Uncloned Verification Standard (Core)

**Version 3 · June 2026 · Uncloned Math**

Specification: [github.com/constarik/uvs](https://github.com/constarik/uvs)
Site: [uncloned.work](https://uncloned.work)

---

> **Normative language.** The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** in this document are to be interpreted as described in RFC 2119.

> **What changed in v3.** UVS v2 was a single monolithic document covering both interactive games and (implicitly) draws. v3 splits the standard into a shared **core** and two **branches**, because a draw is not a game and resisted being expressed as a mode of the game protocol (no player, no `clientSeed`, a different hash, mandatory public randomness). This document is the **core**: the invariant that both branches share. The branches are specified separately:
>
> - **uvGame Standard** (`uvGs.md`) — interactive games with a player (slots, crash, physics arcades, multiplayer).
> - **uvLottery Standard** (`uvLs.md`) — verifiable draws, lotteries, and allocations (no player; selection from a set by pre-published rules).
>
> v2 (`SPEC-v2.md`) is frozen and remains valid for existing deployments. New work targets v3.

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [The Branch Model](#2-the-branch-model)
3. [Determinism](#3-determinism)
4. [Single Engine](#4-single-engine)
5. [Canonical JSON](#5-canonical-json)
6. [Audit Trail Format](#6-audit-trail-format)
7. [Reproducibility Requirements](#7-reproducibility-requirements)
8. [Version Negotiation](#8-version-negotiation)
9. [drand as Trail Notary (optional)](#9-drand-as-trail-notary-optional)
10. [Trust Tiers](#10-trust-tiers)
11. [Philosophy](#11-philosophy)
12. [Shared Threat Model](#12-shared-threat-model)
13. [Core Conformance](#13-core-conformance)

---

## 1. Purpose

UVS-core defines the invariant machinery shared by every UVS-compliant system, regardless of branch:

- how a result is made **deterministic** and **reproducible**
- how the record of a session is **recorded** (the Audit Trail format)
- how any third party **verifies** an outcome without trusting the operator
- how the honesty of a result is **classified** (trust tiers), derived from evidence rather than claimed

UVS is not a library, not a framework, not a blockchain, and not a game engine. It is a protocol. It replaces the certification-lab model — where a regulator examines a system once and issues a certificate — with continuous mathematical verification, where every individual session is independently verifiable by any party.

UVS-core guarantees that a computation was **fair and reproducible**. Everything above that line — payments, identity (KYC/AML), licensing, presentation — is out of scope and remains the operator's responsibility.

---

## 2. The Branch Model

UVS is one core primitive with two branches:

```
            ┌─────────────────────────────────────────┐
            │  UVS-core  (this document)               │
            │  determinism · canonical JSON ·          │
            │  Audit Trail format · reproducibility ·  │
            │  version negotiation · trust tiers ·     │
            │  "not trust, but verification"           │
            └───────────────┬───────────┬──────────────┘
                            │           │
              ┌─────────────┴──┐   ┌────┴──────────────┐
              │  uvGame (uvGs) │   │ uvLottery (uvLs)  │
              │  player games  │   │ draws / lotteries │
              │  Stateless·Move│   │ seeded permutation│
              │  ChaCha20 /512 │   │ drand / SHA-256   │
              └────────────────┘   └───────────────────┘
```

### 2.1 The boundary principle

The division between core and branch is governed by one rule:

- **In the core** goes everything that is **identical** in both branches and will not change if a third branch is added.
- **In a branch** goes everything that **differs** between branches.

A consequence worth stating explicitly: differences between branches are **branch boundaries, not inconsistencies**. For example, uvGame derives its keystream seed with SHA-512 (it feeds a ChaCha20 key+nonce) while uvLottery scores participants with SHA-256 (it needs a single comparison digest). This is not a hash-consistency bug; it is a property of each branch. The core mandates only that *a* verifiable, reproducible derivation exists — not which digest a branch uses.

### 2.2 What the core fixes for all branches

Every UVS branch **MUST**:

1. be bit-exactly deterministic given its declared inputs (§3),
2. compute any hashed state over Canonical JSON (§5),
3. record sessions in the Audit Trail format (§6),
4. be independently reproducible by any third party from the recorded recipe (§7),
5. negotiate protocol versions as integer sets (§8),
6. expose enough evidence for its trust tier to be **derived, not claimed** (§10).

---

## 3. Determinism

Given identical inputs (seed and any declared parameters or recorded inputs), a UVS engine **MUST** produce identical output — on every platform, in every runtime, every time. A single-bit divergence is a fatal error, not a rounding issue.

Determinism is the foundation on which every other guarantee rests: if a result cannot be recomputed identically, it cannot be verified.

Implementations **MUST NOT** consume non-deterministic sources (`Math.random`, wall-clock time, locale, floating-point modes that vary by platform) inside the verifiable computation. Any non-deterministic value that appears in a record (e.g. a human-readable timestamp) **MUST** be inert metadata, excluded from every hash and from every input to the result.

Because cross-platform determinism claims are most often broken by floating-point divergence, a branch whose engines may compute over floats **MUST** define a float discipline (quantization, fixed-point, or a correctly-rounded operation subset — see uvGs §3.5), and determinism **MUST** be demonstrated across more than one independent runtime before being claimed as cross-platform.

---

## 4. Single Engine

One deterministic core is shared across all roles:

- the **simulator** wraps the engine with parameter sweeps and statistical collectors,
- the **server** wraps the engine with infrastructure (auth, balance, API, verification),
- the **client** wraps the engine with experience (graphics, sound, UI).

The mathematical truth of the system lives in exactly one place. Any published "math specification" is a *measurement* of what the engine does — the output of the simulator — never a separate mandate of what it should do. Two engines that are supposed to be the same but are not are a determinism failure (§3).

---

## 5. Canonical JSON

Any value that is hashed (e.g. a `stateHash`, a commitment over structured data, a record digest) **MUST** be serialized as Canonical JSON before hashing:

- object keys sorted by Unicode code point, recursively;
- no insignificant whitespace;
- UTF-8, NFC-normalized;
- RFC 8259 string escaping.

Canonical JSON is what makes a hash reproducible across languages and runtimes. The reference verifiers (in `verifiers/`) demonstrate byte-identical hashing in JavaScript, Python, Java, and C++.

---

## 6. Audit Trail Format

Every UVS session **MUST** be recorded with enough data to independently reproduce and verify its outcome. The core fixes the *shape* of that record; each branch fills in its branch-specific fields.

### 6.1 The recipe principle

> **The trail stores the recipe, not the dish.**

An Audit Trail record **MUST** contain the inputs needed to recompute the outcome (the *recipe*), not merely a transcript of the outcome (the *dish*). Verification is performed by **replay**: a third party re-runs the engine over the recipe and compares the result to what was published. Per-step state hashes, if recorded at all, are an **optional in-play diagnostic** for locating the *first* point of divergence — they are not a substitute for the recipe, and they are not required for verification.

### 6.2 Session header

Every record begins with a header. Core-mandatory fields:

```json
{
  "type":       "uvs-header",
  "uvsVersion": 3,
  "branch":     "uvGame | uvLottery",
  "sessionId":  "string",
  "commitment": "string",          // hash committed before the outcome was known
  "params":     {},                // declared parameters, part of the verifiable input
  "timestamp":  "string"           // inert metadata; excluded from all hashes
}
```

Branches extend this header with their own fields (e.g. `gameMode`/`granularity` in uvGame; `drand`/`pool` in uvLottery). Unknown fields **MUST** be preserved by tooling, not dropped.

### 6.3 Storage requirements

- **MUST** be append-only.
- **MUST** be tamper-evident (any alteration is detectable by recomputation from the recipe).
- Recommended format: JSONL (one JSON object per line); implementations **SHOULD** chunk large trails.
- Compression (gzip, zstd) and delta-encoding of repetitive inputs **MAY** be used, provided a documented expansion procedure restores the exact verifiable input.

---

## 7. Reproducibility Requirements

A system is UVS-core-compliant **if and only if**:

- its computation is fully deterministic given identical inputs (§3);
- every value that is hashed is hashed over Canonical JSON (§5);
- every session is recorded in the Audit Trail format as a replayable recipe (§6);
- its outcome can be **independently recalculated by any third party** with no privileged access and no trust in the operator;
- the reference verifiers (or any independent re-implementation) reproduce published outcomes byte-for-byte.

The last point is the acid test: if no one but the operator can reproduce the result, the system is not UVS-compliant, no matter what it claims.

---

## 8. Version Negotiation

Client and server exchange **integer sets** of supported versions. The negotiated version is `max(intersection)`. An empty intersection **MUST** cause rejection — the session **MUST NOT** start. Sets (not ranges) allow explicit exclusion of a version known to be broken.

The negotiated integer is written to the header as `uvsVersion`. Branch documents may define additional, branch-local profile flags (e.g. uvGame's granularity), but those are not version numbers and are not negotiated by this mechanism.

---

## 9. drand as Trail Notary (optional)

A UVS system **MAY** anchor its Audit Trail to a public randomness beacon — specifically a [drand](https://drand.love) round (the League of Entropy) — as a **time notary**. Used this way, the beacon does **not** enter the outcome; it attests *when* a record was bound to the public timeline.

This role is branch-agnostic and belongs in the core. It is distinct from drand's role as an **outcome source**, which is mandatory in uvLottery and specified there (`uvLs.md`). The two roles **MUST NOT** be conflated: a record may be notarized by drand (a timestamp) without its outcome depending on drand (anti-grinding). The strength a given anchor confers is classified in §10.

When a trail is notary-anchored, the record **SHOULD** carry:

```json
"anchor": {
  "source":    "drand",
  "round":     123456789,
  "randomness":"<hex>",          // present once the round has published
  "verifyUrl": "https://api.drand.sh/<chain>/public/123456789"
}
```

so any party can re-fetch the round and confirm the binding.

Note the direction of proof: embedding `randomness(r)` of a **past** round proves the record was created *no earlier than* round `r` (the value was unpredictable before publication). It does **not** prove the record existed *before* any later moment — an upper bound on creation time requires the record's hash to appear in a medium the operator does not control (§10.2, strength 2).

---

## 10. Trust Tiers

A UVS result's trustworthiness **MUST** be **derived from the evidence present**, not asserted by the operator. The core defines three tiers and three anchor strengths so that tooling and readers classify a result consistently.

### 10.1 Tiers

| Tier | Meaning |
|------|---------|
| 🔴 **Unanchored** | A committed seed and a reproducible recipe exist, but there is no external anchor. The honesty of the *commit* rests on the operator alone. |
| 🟡 **Anchored (self / notary)** | A valid external anchor exists (e.g. a drand notary on the trail, or a self-hosted commitment), but no neutral-registry signature and no immutability proof of the trail itself. |
| 🟢 **Neutral / outcome-bound** | Either a valid signature by a published neutral registry key, **or** a trail-immutability inclusion proof, **or** the outcome is bound to randomness that did not exist at commit time (outcome-binding), with the commitment's prior existence proven per §10.2(3). |

### 10.2 Anchor strengths (presence ≠ 🟢)

An anchor being *present* does not by itself grant the top tier. There are three distinct strengths:

1. **Notary** — a finished record is bound to a public beacon round (a timestamp). Proves *when*, not *unriggability*.
2. **Trail-immutability** — the record's hash and length are committed to a public append-only medium (beacon, transparency log, chain), so the trail cannot be silently rewritten.
3. **Outcome-binding** — the outcome's seed derives from a beacon round that **did not exist at commit time**, so it could not have been pre-selected. This is the strongest anti-grinding guarantee — but it is only as strong as the proof that the commitment actually preceded the round. Outcome-binding therefore **MUST** be accompanied by operator-independent evidence that the commitment existed before the named round published (an append-only-medium inclusion or a neutral-registry timestamp; normative procedure in uvLs §5.4). A future-round reference whose commitment time rests on the operator's word classifies as a notary claim at best.

A result is classified by the *strongest* anchor it actually carries, verified — never by the mere mention of one.

---

## 11. Philosophy

### 11.1 Not a certificate — a protocol

UVS replaces the one-time fairness certificate with continuous, per-session mathematical verification. Compliance with applicable law (AML, KYC, licensing) remains the operator's responsibility.

### 11.2 Not trust — verification

A participant **MUST NOT** have to trust the operator. They **MUST** have the ability to verify independently. The whole standard is organized around making that verification cheap enough that a competent party will actually perform it.

### 11.3 One primitive, many worlds

A single deterministic, committed, reproducible computation underlies a slot spin, a physics game, and a lottery draw alike. The core is that primitive. The branches are the worlds it is dressed for. This is what lets one body of verification machinery serve audiences as different as game studios and state regulators.

### 11.4 Catchability over prevention

UVS does not make cheating impossible; it makes a lie **catchable** — by anyone, after the fact, permanently. A dishonest result is not a risk that *might* surface; it is a fact already written into public data, waiting for the first competent reviewer who looks. That asymmetry is the deterrent.

---

## 12. Shared Threat Model

### 12.1 What the core guarantees (all branches)

- **Seed substitution** — any substitution of a committed seed produces a commitment mismatch, detectable by anyone.
- **Post-hoc result falsification** — outcomes are reproduced from the recorded recipe; a retroactively altered result no longer replays.
- **Trail tampering** — the trail is append-only and tamper-evident; alteration is detectable by recomputation (and, if anchored, by the anchor).
- **Engine divergence** — bit-exact determinism means a non-matching engine is detectable by replay.

### 12.2 What the core does not guarantee

- **Pre-commit collusion** — if an operator leaks a seed before commitment, downstream guarantees weaken. Branches mitigate this differently (uvGame via input-seeding or `clientSeed`; uvLottery via a future drand round).
- **Commitment backdating** — a commitment whose publication time is attested only by the operator can be fabricated after the fact. Closing this requires the §10.2 evidence (append-only inclusion or neutral-registry timestamp); uvLottery makes it mandatory for 🟢 (uvLs §5.4).
- **Input honesty** — UVS proves the published rules were followed on the published inputs. It does **not** prove the inputs themselves (participant list, prize pool, game parameters) were honest. Guarding the inputs requires a public pre-commitment of those inputs (the Audit Trail's job) and is branch-specific.
- **Presentation** — UVS secures computation, not the UI shown to a user.
- **Cryptographic breaks** — UVS inherits the security assumptions of the hash functions and beacons it uses.

### 12.3 Environmental assumptions

- The hash functions in use (SHA-256 / SHA-512) and any beacon (drand) are computationally secure.
- The reference VM executes in an unmodified runtime.
- Audit Trail storage is append-only and tamper-evident.
- A commitment is published before the value it commits to is known — and, for the strongest tier, that publication is itself provable (§10.2).

---

## 13. Core Conformance

An implementation is **UVS-core v3 compliant** when it satisfies §3 (determinism), §5 (canonical JSON), §6 (Audit Trail format / recipe principle), §7 (independent reproducibility), and §8 (version negotiation), and when its trust tier (§10) is derivable from the evidence it publishes.

Core compliance is necessary but not sufficient to call a system "UVS": every UVS system also conforms to exactly one branch — **uvGame Standard** (`uvGs.md`) or **uvLottery Standard** (`uvLs.md`).

---

*UVS-core v3 · Uncloned Math · June 2026 · [uncloned.work](https://uncloned.work)*

*Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
