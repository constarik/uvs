# uvGame Standard — UVS Branch for Interactive Games

**Version 3 · June 2026 · Uncloned Math**

Builds on: **UVS-core v3** (`uvs.md`)
Specification: [github.com/constarik/uvs](https://github.com/constarik/uvs) · Site: [uncloned.work](https://uncloned.work)
Reference: [paddla.uncloned.work](https://paddla.uncloned.work) · [registrar.uncloned.work](https://registrar.uncloned.work)

---

> **Normative language.** **MUST**, **MUST NOT**, **SHOULD**, **MAY** per RFC 2119.

> **Scope.** uvGame is the UVS branch for **interactive games with a player** — slots, crash games, instant-win games, physics arcades, and real-time multiplayer. It inherits everything in UVS-core (`uvs.md`) and adds the game-specific machinery: game modes, the player seed contribution, the ChaCha20 keystream, the Move protocol, and the optional Protected layer.
>
> A draw with no player belongs to **uvLottery** (`uvLs.md`), not here.

> **Relationship to v2.** uvGame v3 is the continuation of the game half of the frozen v2 monolith (`SPEC-v2.md`). Stateless and Move **Batch** are shipped and normative. Move **Sync** (multiplayer, with mandatory signatures) is specified here as a **Planned profile** (§7), gated on its reference implementation; it is not yet a shipped guarantee.

---

## Table of Contents

1. [Inheritance from Core](#1-inheritance-from-core)
2. [Game Modes](#2-game-modes)
3. [Seeds, Commitment & PRNG](#3-seeds-commitment--prng)
4. [Move Protocol — Batch (shipped)](#4-move-protocol--batch-shipped)
5. [Protected Layer](#5-protected-layer)
6. [Session Lifecycle](#6-session-lifecycle)
7. [Move Sync — Planned profile](#7-move-sync--planned-profile)
8. [Error Codes](#8-error-codes)
9. [Reference Implementations](#9-reference-implementations)
10. [Shipped Conformance (PADDLA)](#10-shipped-conformance-paddla)
11. [Branch Threat Model](#11-branch-threat-model)

---

## 1. Inheritance from Core

uvGame is a UVS branch and therefore **MUST** satisfy all of UVS-core v3: bit-exact determinism, Canonical JSON for hashed state, the Audit Trail recipe format, independent reproducibility, integer version negotiation, and derivable trust tiers. This document specifies only what is *additional* or *specialized* for games. Where this document is silent, the core governs.

The header `branch` field (core §6.2) is `"uvGame"`.

---

## 2. Game Modes

Every uvGame game operates in one of two modes, declared in the session header.

### 2.1 Stateless Mode

No player input during play. The outcome is fully determined by the seed:

```
compute(seed) → result
```

Verification: any party recomputes `compute(seed)` and compares. Examples: slot, crash game, instant-win game, dice.

### 2.2 Move Mode

Player actions (**Moves**) influence the outcome:

```
compute(seed, move₁, …, moveₙ) → result
```

Move Mode introduces three concepts: the **Move as verification unit**, **verification granularity** `G`, and **full session replay**. Granularity is declared in the header:

| G | Meaning | Timing | Use case | Status |
|---|---------|--------|----------|--------|
| `ALL` | Batch — verify once at end | Post-game | Single-player arcade | **Shipped** (§4) |
| `1` | Sync — verify every tick | Per-tick | Real-time multiplayer | **Planned** (§7) |
| `N` | Periodic — verify every N ticks | Checkpointed | Configurable | Planned |

The verification protocol is identical regardless of `G`; only the frequency changes.

### 2.3 Move as verification unit

A single Move at a tick, with the current seed, produces a deterministic state change:

```
stateₙ₊₁ = engine(stateₙ, seed, moveₙ, tick)
```

A single Move is structurally equivalent to a single Stateless game — both are atomic, deterministic, verifiable computations. In multiplayer Move Sync the atomic unit scales from a **Move** to a **tick** (all players' Moves at that tick), because each Move's effect is coupled to the others through shared state; the principle is unchanged.

---

## 3. Seeds, Commitment & PRNG

### 3.1 Seed generation and commitment

The server **MUST** generate `serverSeed` with a CSPRNG, minimum 32 bytes. Before play, the server **MUST** publish `commitment = SHA-256(serverSeed)`. The player **MUST** publish `clientSeed` after recording the commitment. Both are immutable for the session.

### 3.2 PRNG

uvGame **MUST** use ChaCha20 (RFC 8439) as its PRNG, keyed from a SHA-512 combined seed:

```
combinedSeed = SHA-512( serverSeed + ":" + clientSeed + ":" + nonce )
key   = combinedSeed[0..31]      // 32 bytes
nonce = combinedSeed[32..43]     // 12 bytes
```

SHA-512 yields exactly the 44 bytes ChaCha20 needs (key + nonce) with no secondary derivation; the remaining 20 bytes are reserved for future domain separation.

### 3.3 Input-seeded randomness (optional)

In Move Mode, randomness **MAY** depend on player input:

```
random(tick) = f(seed, move.x, move.y, tick)
```

This has a critical property: **even if the player knows the seed, they cannot predict future outcomes**, because they do not know their own future Moves. This allows the seed to be revealed *before* play. Input-seeding is **OPTIONAL** and **MUST** be declared in the header.

### 3.4 Commit-reveal

- **Stateless:** publish `commitment` → player publishes `clientSeed` → play → server reveals `serverSeed`; player checks `SHA-256(serverSeed) == commitment`.
- **Move with input-seeding:** the seed **MAY** be revealed before play (§3.3).
- **Move without input-seeding:** standard commit-reveal applies.

### 3.5 Floating point in the verifiable computation

Bit-exact determinism (core §3) is most often broken not by RNG but by **floating-point divergence across runtimes** — fused multiply-add, transcendental library functions, and optimizer reassociation all vary by engine and platform. An engine whose verifiable computation touches floats **MUST** do at least one of:

- **quantize** every float-derived value at the point it enters the verifiable state or a hash preimage (fixed decimal places, as PADDLA does with `toFixed(4)`, or fixed-point integers), so platform noise below the quantum cannot propagate; or
- restrict itself to operations with IEEE 754-mandated correct rounding (`+ − × ÷ √`) and document that restriction; or
- use integer/fixed-point arithmetic throughout.

`Math.sin`-style library transcendentals **MUST NOT** feed unquantized results into verifiable state. Conformance to this section is demonstrated by the cross-platform audit requirement in §10.5.

### 3.6 Session-level outcome-binding (RECOMMENDED profile)

Outcome-binding (core §10.2, strength 3) is usually framed per-draw, where a multi-second wait for a future beacon round is acceptable. In an interactive game it is not — and it does not need to be paid per game. This profile binds the **session** instead:

1. At session open, the server (or Registrar) publishes `commitment = SHA-256(sessionEntropy)` together with a target **future** drand round `R` — the next round whose publication time exceeds the commitment time (quicknet period 3 s ⇒ worst case a few seconds).
2. The client fetches `randomness(R)` when it publishes — typically during session load or menu time, so the wait is hidden, not felt.
3. The session seed is derived as `serverSeed = SHA-256( sessionEntropy + ":" + randomness(R) )` and enters the §3.2 chain unchanged (in Protected deployments it feeds the §5.1 derivation in place of the raw server entropy, with `clientSeed` retained).
4. `sessionEntropy` is revealed at session close per §3.4; anyone confirms `SHA-256(sessionEntropy) == commitment` and that `R` published after the commitment.

Every game in the session inherits the anchor: the operator could not have pre-selected `serverSeed`, because the entropy that completes it did not exist at commit time. Per-game freshness continues to come from `nonce`/tick and, in input-seeded games (§3.3), from the player's own future Moves.

**Pipelining.** For back-to-back sessions — or per-game binding where a game wants it — the commitment for session N+1 **SHOULD** be issued while session N is live; its round has already published by the time the player continues. Zero perceived latency after the first session.

**Tier effect.** A session bound this way carries outcome-binding and classifies 🟢, **provided** the commitment's existence before `R` is itself proven by operator-independent evidence (the uvLs §5.4 procedure, applied to the session commitment; a Registrar-signed timestamp qualifies only if the Registrar is a published *neutral* key, not the operator). Trail-immutability anchoring of the finished trail (core §10.2, strength 2) remains an alternative 🟢 path with no wait at all; the two **MAY** be combined.

Use of this profile is **OPTIONAL**, **RECOMMENDED** wherever a one-time ~3-second session-open wait is acceptable, and **MUST** be declared in the session header (`sessionBinding: "outcome-bound"`, with the target round recorded in the core §9 anchor format).

---

## 4. Move Protocol — Batch (shipped)

**Move Batch (`G = ALL`)** is single-player and is the shipped, normative Move profile (reference: PADDLA).

```
Client: play(seed, moves[]) → result, inputLog
Client → Server: { inputLog, clientResult }
Server: replay(seed, inputLog) → serverResult
serverResult === clientResult → VERIFIED
```

The client plays the full game locally, recording an `inputLog` (the recipe). After the game, it sends `inputLog` + result. Any party — server or independent third party — replays the engine over `inputLog` with the same seed and compares. Per core §6.1, the trail stores this recipe, and verification is by replay.

---

## 5. Protected Layer

The Protected layer is **optional**. It adds IP protection, third-party verification, and certification-gap closure, and combines with either game mode.

### 5.1 WASM per-session layer

A Registrar issues a per-session `regSeed`. The client builds a **unique WebAssembly binary** from `regSeed` and runs it to derive the seed:

```
regSeed → buildWasm(regSeed) → compile → compute(gameSeed) → finalSeed
```

`finalSeed` then replaces `serverSeed` in the seed chain (§3.2), with `clientSeed` retained:

```
combinedSeed = SHA-512( finalSeed + ":" + clientSeed + ":" + nonce )
```

**Security property.** Extracting the client code without `regSeed` is **operationally difficult**: an attacker obtains a WASM *generator*, but without the Registrar-issued `regSeed` cannot predict which binary will execute in a given session. The strength of this property depends on (a) `regSeed` carrying sufficient entropy to make exhaustive precomputation impractical and (b) the generator producing binaries whose behavior across `regSeed` values is statistically indistinguishable. Formal entropy/diversity bounds are reserved for a later revision.

**Classification (normative).** The Protected layer is **obfuscation engineering, not cryptography**. It raises the *cost* of extraction; it does not make extraction infeasible in the cryptographic sense, and no reduction to a hard problem is claimed. Consequently:

- Protected **MUST NOT** be counted as evidence toward a trust tier (core §10). Tiers are earned by commitments, anchors, and signatures only; a Protected session with no anchor is still 🔴.
- Marketing and conformance claims **MUST NOT** describe the WASM layer as a cryptographic guarantee, "unbreakable," or equivalent.
- The fairness guarantees of uvGame (commit-reveal, determinism, replay) **MUST** hold even if the Protected layer is fully reverse-engineered. Protected defends the operator's IP; it defends nothing for the player, and the player's verification path must never route through trusting it.

**Verification.** After play, the client or any third party rebuilds the WASM from `regSeed`, runs `compute(gameSeed)`, and confirms `finalSeed`. The Registrar can verify with a JS mirror, `runSpec(regSeed, gameSeed)`, without WASM.

### 5.2 Registrar (role)

The Registrar is an **independent verification node**, not a separate protocol — a role a server can assume. Its responsibilities: issue `regSeed` (the pre-play commitment), hold a canonical engine copy, optionally corroborate sessions by replay, manage `ENGINE_HASH` (`SHA-256(engine)`) and a domain `WHITELIST`.

**Irreducible roles.** Verification is self-contained on the client (§10); the Registrar is *optional for verification*. Its irreducible roles are (i) the **pre-play commitment** — issuing `regSeed` *before* play so the operator cannot pick the seed after the bet — and (ii) **trail hosting**. The pre-play commit is the one thing *something* must provide: the Registrar, or a public beacon such as drand.

### 5.3 ENGINE_HASH, WHITELIST, blockchain

`ENGINE_HASH` and `WHITELIST` **MAY** be published to a blockchain for timestamped authorship, public auditability, and optional per-session micro-royalties. The blockchain operates on a slow time scale; live verification is real-time and settles asynchronously. The WHITELIST does not prevent code copying — it prevents copied engines from producing Registrar-verified sessions.

---

## 6. Session Lifecycle

| State | Description |
|---|---|
| **PENDING** | Version negotiated, seeds committed. No rounds started. |
| **ACTIVE** | At least one tick executed; Audit Trail being written. |
| **MOVE** | Move Mode only. Awaiting player input; subject to timeout (recorded as SKIP). |
| **REVEALED** | `serverSeed` disclosed and verified. Session closed. |
| **HALTED** | Fatal error (§8). Refund protocol in effect. |

A `PUBLISHED` state (trail published to a public location) is introduced by the Move Sync profile (§7).

---

## 7. Move Sync — Planned profile

> **Status: PLANNED.** This profile is specified for direction and is **gated on a reference implementation** (NOISORE) plus the reference SDK. It is **not** a shipped guarantee of uvGame v3. Until shipped, conformance claims **MUST NOT** assert Move Sync.

Move Sync (`G = 1`) is real-time multiplayer: each Move is sent immediately, the server applies it to authoritative state and broadcasts. The server is authoritative **but verifiable** — any player can replay the Move sequence and catch a dishonest server. Detection alone is insufficient, so the profile adds cryptographic accountability:

- **Player signatures (ed25519).** At session start the client generates an ephemeral keypair; the private key **MUST NOT** leave the client. Each move is signed over `canonical({ sessionId, seq, move })`. The server cannot forge moves.
- **Sequential processing (MUST).** The server processes each player's moves in strict `seq` order; a `signed_ack` for `seq=N` implicitly acknowledges all `seq < N`.
- **Server acks.** On acceptance the server returns `ed25519_sign(serverPrivKey, canonical({ sessionId, seq, move_hash }))`; `move_hash` binds the ack to specific content.
- **Public trail publication.** After completion the server publishes the full trail to an append-only public location and hands the player `{ auditTrailURL, auditTrailHash, signature }`. This defeats log equivocation (showing different histories to different parties).
- **Move ordering & latency.** Concurrent moves for a tick are ordered deterministically (declared in the header); the server **MUST NOT** advantage lower-latency players (recommended: fixed collection window, then simultaneous apply).

This evidence layer addresses move fabrication, content substitution, omission, equivocation, and post-publication mutation. Higher-level dispute resolution (arbitration, slashing, reputation) remains out of scope.

The full normative text of the signing/ack/publication protocol is maintained in `DESIGN_NOTES_uvGame_sync.md` until it is promoted into this section on ship.

---

## 8. Error Codes

### 8.1 Fatal (MUST halt)

| Code | Description |
|---|---|
| `ERR_HASH_MISMATCH` | `SHA-256(serverSeed) ≠ commitment`. Halt + double-stake refund. |
| `ERR_VERSION_INCOMPATIBLE` | Empty version intersection. Session **MUST NOT** start. |
| `ERR_NONCE_REUSE` | Same nonce used twice. Affected rounds refunded. |
| `ERR_RNG_DIVERGENCE` | JS and WASM produced different output. |
| `ERR_STATE_CORRUPT` | Recomputed state ≠ recorded. Trail invalid from that step. |
| `ERR_WASM_MISMATCH` | WASM result ≠ Registrar `runSpec()`. Protected only. |

### 8.2 Move Sync (planned)

`ERR_SIGNATURE_INVALID`, `ERR_SEQ_GAP`, `ERR_NO_PUBLIC_LOG`, `ERR_MISSING_ACK`.

### 8.3 Recoverable (MAY continue)

`WARN_CLIENT_SEED_EMPTY`, `WARN_PLAYER_TIMEOUT` (SKIP), `WARN_REGISTRAR_OFFLINE` (fallback seed).

---

## 9. Reference Implementations

| Name | Mode | Granularity | Protected | Status |
|------|------|-------------|-----------|--------|
| Registrar Demo | Stateless | — | Yes (WASM + Registrar) | Production |
| **PADDLA** | Move | `ALL` (Batch) | Yes (WASM + Registrar) | Production |
| NOISORE | Move | `1` (Sync) | TBD | Planned |

**PADDLA** ([paddla.uncloned.work](https://paddla.uncloned.work)) — physics arcade, Move Batch: the player controls a bumper, `inputLog` is recorded locally, and verification replays the engine. Published on npm as `paddla-engine`. Shipped conformance below.

**NOISORE** ([noisore.uncloned.work](https://noisore.uncloned.work)) — multiplayer arcade; the planned reference for Move Sync (§7).

---

## 10. Shipped Conformance (PADDLA)

> Concrete values of the live PADDLA reference, pinned against the abstract text so spec↔implementation drift is auditable. Reconciled against engine `ENGINE_VERSION 9`, registrar `2.4.x`, client `9.2.0`.

**10.1 Per-tick combined seed.** PADDLA is Move Batch, input-seeded; a fresh ChaCha20 PRNG is created **every tick**:

```
combinedSeed_t = SHA-512( serverSeed + ":" + bumperX.toFixed(4) + ":" + bumperY.toFixed(4) + ":" + t )
```

Mapping to §3.2: the per-tick `clientSeed` component is the bumper position `"x.xxxx:y.yyyy"`, and the `nonce` is the tick counter `t`. The header `clientSeed: "uvs-paddla"` is a constant session label. The `.toFixed(4)` quantization is the §3.5 float discipline: bumper coordinates enter the verifiable computation only at fixed precision.

**10.2 Seed derivation.** `serverSeed = runSpec(regSeed, gameSeed)` (uint32) zero-padded to 64 hex; the Registrar's JS mirror reproduces the WASM byte-identically (vector `regSeed=305419896, gameSeed=12345 → 0x4B956F81`).

**10.3 Trail = recipe.** The public trail stores `{ serverSeed, commitment, regSeed, gameSeed, delta-encoded inputLog, totalWin, ... }`; `gameId = SHA-256(serverSeed + ":" + SHA-256(JSON(compressedInputLog)))`. Per-step `{stateHash, rngCalls}` is an optional in-play diagnostic, not part of the stored trail.

**10.4 Self-contained verification.** Third-party verification runs entirely on the client / any page holding the engine, without trusting the Registrar: (1) rebuild WASM (or run `runSpec`) from `regSeed` and confirm `serverSeed`; (2) replay the engine over `inputLog` and confirm `totalWin`. The trail-replay page re-verifies any public game by link.

**10.5 Determinism audit.** 300 sessions · 454,716 ticks · 4 input policies → result *and full state* reproduced byte-identically, no module-level leakage. The per-tick fresh-PRNG design structurally precludes the running-stream desync class — no un-logged RNG consumption can drift a replay.

**Platform coverage (normative).** A "byte-identical" determinism claim **MUST** be backed by an audit executed on **at least two independent JS engines** (e.g. V8 and JavaScriptCore or SpiderMonkey) **and at least two operating systems**, with the runtime matrix published alongside the audit numbers. Single-runtime reproduction does not exercise the float-divergence class (§3.5) and **MUST NOT** be reported as cross-platform determinism.

**Cross-platform matrix (audited 2026-06-11; harness: `paddla-engine/test-xplat-audit.js` — 300 sessions · 229,536 ticks · 4 integer-LCG input policies, header timestamp and RNG internals excluded from hashes per core §3):**

| Runtime | Engine | OS | STATE digest | RESULTS digest |
|---|---|---|---|---|
| node 24.12 | V8 | Windows x64 | `60e11a9c…8d4955` | `926e1d69…54edd6` |
| node 22.22 (native ChaCha20) | V8 | Linux x64 | `60e11a9c…8d4955` | `926e1d69…54edd6` |
| node 22.22 (pure-JS ChaCha20) | V8 | Linux x64 | `60e11a9c…8d4955` | `926e1d69…54edd6` |
| bun 1.3.14 | JavaScriptCore | Linux x64 | `4eb17938…ac4096` | `926e1d69…54edd6` |

Findings: **outcomes (tick counts + totalWin) are byte-identical on all four configurations** — across engines (V8 vs JSC), operating systems, Node major versions, and ChaCha20 implementations (native and pure-JS keystreams verified word-identical). Full mid-flight float state is byte-identical **within an engine family** across OSes and versions, but drifts in low-order float bits **across engines** — the §3.5 divergence class, and precisely why per-step `stateHash` is an in-play diagnostic (§10.3), never trail data: replay verification compares results, which carry no engine fingerprint.

**10.6 Trust tier.** Live PADDLA binds the pre-play commit via the Registrar and notarizes the trail with a drand round (core §9) → tier 🟡. It is not outcome-bound (the seed does not derive from a future round), by deliberate design — the arcade favors instant play over the ~seconds wait per-game outcome-binding would require. The designated upgrade path is §3.6: one session-open binding (hidden in load time, pipelined thereafter) lifts every game in the session to 🟢 without touching the instant-play feel. Per §5.1, the Protected layer contributes nothing to this tier.

---

## 11. Branch Threat Model

Beyond the shared core threats (`uvs.md` §12), uvGame specifically prevents:

- **Seed substitution** — commitment mismatch halts the session.
- **RNG manipulation** — keystream fully determined by `combinedSeed` via ChaCha20.
- **Move falsification (Move Mode)** — every Move is recorded; replay detects any alteration.
- **Engine substitution in production** — Registrar holds a certified copy; the operator's engine is irrelevant if the Registrar disagrees (Protected).
- **IP theft (deterrence, not prevention)** — per-session WASM makes extracted code without `regSeed` operationally difficult (Protected, §5.1). This is obfuscation-grade: it raises cost, it is not a cryptographic guarantee.
- **Multiplayer cheating / equivocation (Move Sync, planned)** — signed moves + acks + public trail.

Not prevented: pre-commit collusion (unless input-seeded or future-anchored), UI substitution, unbalanced game design, payment-layer attacks, network-latency exploitation in Sync, cryptographic breaks.

---

*uvGame Standard v3 · Uncloned Math · June 2026 · built on UVS-core v3 · [uncloned.work](https://uncloned.work)*

*Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
