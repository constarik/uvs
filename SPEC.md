# UVS — Uncloned Verification Standard

**Version 2 · April 2026 · Uncloned Math**

Specification: [github.com/constarik/uvs](https://github.com/constarik/uvs)  
Site: [uncloned.work](https://uncloned.work)  
Reference implementations: [paddla.uncloned.work](https://paddla.uncloned.work) · [registrar.uncloned.work](https://registrar.uncloned.work)

---

> **Normative language.** The key words **MUST**, **MUST NOT**, **SHOULD**, **MAY** in this document are to be interpreted as described in RFC 2119.

> **Change from v1.** UVS v2 unifies the Registrar Protocol, WASM verification layer, and Move-based game architecture into a single protocol. The Registrar is now a role within UVS. WASM is a formal optional layer. Move is a first-class concept with configurable verification granularity.

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Protocol Layers](#2-protocol-layers)
3. [Core Protocol](#3-core-protocol)
4. [Game Modes](#4-game-modes)
5. [Move Protocol](#5-move-protocol)
6. [Protected Layer](#6-protected-layer)
7. [Deterministic Execution Model](#7-deterministic-execution-model)
8. [Data Types & PRNG](#8-data-types--prng)
9. [Session Lifecycle](#9-session-lifecycle)
10. [Seed & Commitment Protocol](#10-seed--commitment-protocol)
11. [Audit Trail](#11-audit-trail)
12. [Error Codes & Failure Modes](#12-error-codes--failure-modes)
13. [Reproducibility Requirements](#13-reproducibility-requirements)
14. [Reference Implementations](#14-reference-implementations)
15. [Test Vectors](#15-test-vectors)
16. [Philosophy](#16-philosophy)
17. [Threat Model](#17-threat-model)

---

## 1. Purpose

UVS is a universal protocol for verifiable games. It defines:

- how randomness is generated
- how state is recorded
- how simulation is reproduced
- how fairness is verified
- how player actions (Moves) are verified at any granularity

UVS is not a library, not a framework, not a blockchain, and not a game engine. It is a protocol.

UVS replaces the certification-lab model — where a regulator examines a simulator once and issues a certificate — with continuous mathematical verification where every session is independently verifiable by any party.

---

## 2. Protocol Layers

UVS is organized in three layers. Only Core is mandatory.

```
┌─────────────────────────────────────────────┐
│  PROTECTED (optional)                       │
│  WASM · Registrar · ENGINE_HASH · Blockchain│
├─────────────────────────────────────────────┤
│  GAME MODE (choose one)                     │
│  Stateless  ·  Move (granularity G)         │
├─────────────────────────────────────────────┤
│  CORE (mandatory)                           │
│  Determinism · Seed · Commitment · Versions │
│  Single Engine · Audit Trail                │
└─────────────────────────────────────────────┘
```

**Core** — determinism, seed generation, commitment scheme, version negotiation, single-engine architecture, audit trail. Required for any UVS-compliant game.

**Game Mode** — defines how the game interacts with the player. Stateless games have no player input during play. Move games accept player actions that influence outcomes.

**Protected** — optional layer for IP protection, third-party verification, and certification-gap closure. Can be combined with any Game Mode.

---

## 3. Core Protocol

The Core protocol is mandatory for all UVS-compliant implementations.

### 3.1 Determinism

Given identical seed and identical inputs, the engine **MUST** produce identical output. On every platform. In every runtime. Always. A single-bit divergence is a fatal error, not a rounding issue.

### 3.2 Single Engine

One deterministic core, shared across all roles:

- **Simulator** wraps the engine with parameter loops and statistical collectors
- **Server** wraps the engine with infrastructure (auth, balance, API, verification)
- **Client** wraps the engine with experience (graphics, sound, UI)

The mathematical truth of the game lives in one place. The Math Specification is the output of the simulator — a measurement of what the engine does — not a mandate for what it should do.

### 3.3 Seed Generation

The server **MUST** generate seeds using a cryptographically secure random number generator (e.g. `crypto.randomBytes`). Seeds **MUST** be at minimum 32 bytes.

### 3.4 Seed Commitment

Before any round begins, the server **MUST** publish `SHA-256(serverSeed)` as a commitment. The player **MUST** publish `clientSeed` after recording the commitment. Both values are immutable for the session duration.

### 3.5 Version Negotiation

Client and server exchange integer sets of supported versions. Negotiated version = `max(intersection)`. Empty intersection → reject. Sets (not ranges) allow explicit exclusion of broken versions.

### 3.6 Audit Trail

Every simulation step **MUST** be recorded with sufficient data to independently reproduce and verify the outcome. See section 11 for format.

---

## 4. Game Modes

Every UVS game operates in one of two modes.

### 4.1 Stateless Mode

No player input during play. The outcome is fully determined by the seed.

```
compute(seed) → result
```

Verification: any party recomputes `compute(seed)` and compares.

Examples: slot, crash game, instant lottery, dice.

### 4.2 Move Mode

Player actions (Moves) influence the outcome. The game accepts a sequence of Moves, and randomness **MAY** depend on both the seed and the Moves.

```
compute(seed, move₁, move₂, ..., moveₙ) → result
```

Move Mode introduces three new concepts:

1. **Move as Verification Unit** — a single Move with its seed and tick constitutes an independently verifiable computation, equivalent to one Stateless game.
2. **Verification Granularity** — how often verification occurs.
3. **Full Session Replay** — any party can replay the complete session and verify every state transition.

Move Mode is defined in detail in section 5.

---

## 5. Move Protocol

### 5.1 Move as Verification Unit

A Move is a single player action at a specific tick. Each Move, combined with the current seed and tick counter, produces a deterministic state change:

```
stateₙ₊₁ = engine(stateₙ, seed, moveₙ, tick)
```

This state change is independently verifiable: any party with the engine, seed, prior state, and the Move can recompute `stateₙ₊₁` and compare.

**A single Move is structurally equivalent to a single Stateless game.** Both are atomic, deterministic, verifiable computations. The only difference is scope: Stateless verifies the entire game at once; Move verifies one step at a time.

This equivalence is the foundation of UVS Move Mode. It means the same verification machinery works at any scale — from "verify once at the end" to "verify every tick" — without protocol changes.

### 5.2 Verification Granularity

Granularity `G` defines how many Moves accumulate before verification:

| G | Meaning | Verification timing | Use case |
|---|---------|-------------------|----------|
| `ALL` | Batch — verify once at end | Post-game | Single-player arcade |
| `1` | Sync — verify every Move | Per-tick | Multiplayer real-time |
| `N` | Periodic — verify every N ticks | Checkpointed | Configurable |

Granularity is declared in the session header. The verification protocol is identical regardless of `G`; only the frequency changes.

- `G = ALL`: client sends the complete `inputLog` after the game ends. Server replays the full session and compares.
- `G = 1`: client sends each Move immediately. Server verifies before broadcasting to other players.
- `G = N`: client sends a batch of N Moves. Server replays the batch and compares the checkpoint stateHash.

### 5.3 Input-Seeded Randomness

In Move Mode, randomness **MAY** depend on player input:

```
random(tick) = f(seed, move.x, move.y, tick)
```

This has a critical security property: **even if the player knows the seed, they cannot predict future random outcomes** because they do not know their own future Moves. This allows the seed to be revealed **before** play begins, unlike Stateless Mode where the seed is revealed **after**.

Input-Seeded Randomness is **OPTIONAL** within Move Mode. Games **MAY** use seed-only randomness with Move input affecting only deterministic mechanics (e.g. steering, placement). The choice **MUST** be declared in the session header.

### 5.4 Full Session Replay

Any party with the engine, seed, and **complete** Move history can independently replay the **full session** and verify every state transition. In multiplayer, individual Moves cannot be verified in isolation — each Move's effect depends on all other players' Moves at the same tick. Therefore, replay always operates on the full session: all players, all ticks, all Moves.

Full session replay is possible because:

1. The engine is deterministic (Core requirement)
2. The engine is shared (Single Engine requirement)
3. **All** Moves from **all** players are recorded (Audit Trail requirement)
4. Seeds are known to all parties (Seed Protocol requirement)

Any participant can replay the full session and compare `stateHash` at every tick. If any tick diverges, either the server computed incorrectly or a client submitted falsified data — the Audit Trail identifies the first point of divergence.

### 5.4.1 Verification Timing

In Move Sync (G=1), real-time client-side verification is impractical — the verification computation delays the player's next Move, causing SKIPs and competitive disadvantage.

Client-side verification in Move Sync is therefore **post-factum**: after the session ends, any player can download the Audit Trail and independently replay the full session at their own pace.

**Real-time integrity** is the server's responsibility (G=1 verification on every tick). **Post-factum integrity** is the player's right (Audit Trail + Full Session Replay).

| Timing | Who verifies | When | Purpose |
|--------|-------------|------|---------|
| Real-time | Server | Every tick (G=1) | Prevent cheating during play |
| Post-factum | Any player | After session | Verify server honesty |

### 5.5 Move Batch (G = ALL)

Single-player. Client plays the full game locally, recording an `inputLog`. After the game ends, client sends `inputLog` + `totalWin` to the server. Server replays the full session with the same seed and inputLog, compares the result.

```
Client: play(seed, moves[]) → result, inputLog
Client → Server: { inputLog, clientResult }
Server: replay(seed, inputLog) → serverResult
serverResult === clientResult → VERIFIED
```

Reference implementation: **PADDLA**.

### 5.6 Move Sync (G = 1)

Multiplayer. Each Move is sent to the server immediately. Server verifies the Move, applies it to the authoritative state, and broadcasts the result to all players.

```
Player A → Server: { move, tick }
Server: verify(state, seed, move, tick) → newState
Server → All players: { newState, tick }
Any player: replay(state, seed, move, tick) → verify newState
```

**Server role in Move Sync:**

In Move Batch, the client is the authority and the server is the auditor (post-factum replay). In Move Sync, the server is the **authoritative state holder** — but with UVS guarantees:

- The engine is the same on client and server (Single Engine)
- The seed is known to all players (Seed Protocol)
- Every Move is recorded (Audit Trail)
- Any player can independently verify any tick (Full Session Replay)

This is **not** the classical oracle model (where the server is trusted blindly). The server is authoritative **but verifiable** — any player can catch a dishonest server by replaying the Move sequence locally.

**Move ordering in multiplayer:**

When multiple players submit Moves for the same tick, the server **MUST** apply them in a deterministic order. Recommended: sort by `playerId` (lexicographic). The ordering rule **MUST** be declared in the session header and **MUST** be the same on all clients.

**Latency and fairness:**

Network latency means different players' Moves arrive at different times. The server **MUST NOT** give advantage to lower-latency players. Recommended: collect all Moves for tick T within a fixed time window, then apply all simultaneously in deterministic order.

Reference implementation: **NOISORE** (planned).

---

## 6. Protected Layer

The Protected layer is **optional**. It adds IP protection, third-party verification, and certification-gap closure. It can be combined with any Game Mode (Stateless or Move).

### 6.1 WASM Per-Session Layer

The Registrar issues a `regSeed` for each session. The client uses `regSeed` to build a **unique WebAssembly binary** and runs it to derive `finalSeed`:

```
regSeed → buildWasm(regSeed) → compile → compute(gameSeed) → finalSeed
```

The WASM binary's internal structure (which operations, in what order, with what constants) is determined by `regSeed` via a deterministic LCG. Each session produces a different binary.

**Security property:** extracting the client code without `regSeed` is operationally useless. The attacker has a WASM **generator**, but without the Registrar-issued `regSeed`, they cannot predict which WASM will execute in any given session.

**Verification:** after the game, the client (or any third party) can independently rebuild the WASM from `regSeed`, run `compute(gameSeed)`, and verify that `finalSeed` matches. The Registrar can independently verify using a JS mirror of the WASM logic (`runSpec()`).

### 6.2 Registrar (Role)

The Registrar is an **independent verification node** within UVS. It is not a separate protocol — it is a role that a server can assume.

**Registrar responsibilities:**

1. **Issues `regSeed`** — cryptographically random, per-session, used for WASM generation
2. **Holds certified engine copy** — the Registrar's copy is the canonical reference
3. **Verifies sessions** — replays WASM computation and/or engine replay independently
4. **Manages ENGINE_HASH** — SHA-256 of the certified engine binary
5. **Manages WHITELIST** — list of domains authorized to run this engine

**Session flow with Registrar:**

```
Client → Registrar: /session/new { gameSeed, versions }
Registrar: negotiates version, generates regSeed
Registrar → Client: { regSeed, sessionId }

Client: buildWasm(regSeed) → compute(gameSeed) → finalSeed
Client: plays game using finalSeed
Client → Registrar: { result } or { inputLog, totalWin }

Registrar: runSpec(regSeed, gameSeed) === wasmResult?     (WASM check)
Registrar: replay(finalSeed, inputLog) === clientResult?  (Engine replay, if Move Mode)
Both match → VERIFIED
```

### 6.3 ENGINE_HASH and WHITELIST

The developer registers with the Registrar:

- **ENGINE_HASH** — `SHA-256(engine.js)`, identifying the certified build
- **WHITELIST** — domains authorized to run this engine

Any session from a domain not in the WHITELIST is rejected. This prevents unauthorized operators from using the engine even if they obtain the source code. The WHITELIST does not prevent code copying — it prevents copied engines from producing Registrar-verified sessions.

### 6.4 Blockchain (Optional Sub-Layer)

ENGINE_HASH and WHITELIST **MAY** be published to a blockchain smart contract for:

- **Timestamped authorship** — cryptographic proof of priority, cannot be altered retroactively
- **Public auditability** — anyone can verify the registered hash
- **Automatic micro-royalties** — per-session payments to the developer via smart contract

Blockchain operates on a slow time scale (seconds). Session verification operates in real time. The Registrar caches registered engines and handles live verification, settling to the blockchain asynchronously.

### 6.5 Certification Gap Closure

The traditional certification model has a structural gap: a laboratory certifies an engine once (snapshot), but production is a continuous stream. Nobody verifies that what runs in production matches the certified build.

The Registrar closes this gap by construction. The certified engine lives not in a PDF in a laboratory but as an **active participant in every session**. The operator's server can run anything it wants — but the result is only accepted if the Registrar's independent computation agrees.

---

## 7. Deterministic Execution Model

### 7.1 Reference VM (JS)

The JS implementation serves as the canonical reference VM. This does not restrict the protocol to JavaScript — WebAssembly and other runtimes are compatible — but JS **MUST** remain the canonical layer of truth.

- **MUST** run in the browser without additional dependencies
- **MUST** run in Node.js
- **MUST** be the reference against which all other implementations are validated

### 7.2 WebAssembly Execution Layer

WASM serves two roles in UVS:

1. **Per-session seed transformation** (Protected layer, section 6.1) — generating unique binaries from `regSeed`
2. **Performance accelerator** — enabling authoring simulation math in Rust/C++/Zig

WASM **MUST** remain deterministic and **MUST** produce bit-for-bit identical output to the JS reference.

### 7.3 Caller-Defined Parameters

The simulation defines parameters at initialization (game mode, bet, number of balls, volatility tier). These parameters **MUST** be declared before execution, included in the Audit Trail header, and treated as part of the verifiable input alongside the seed.

---

## 8. Data Types & PRNG

### 8.1 PRNG Specification

All UVS implementations **MUST** use ChaCha20 (RFC 8439) as the pseudorandom number generator.

**Initialization:**
- **Key** — first 32 bytes of `combinedSeed` (hex-decoded)
- **Nonce** — bytes 32–43 of `combinedSeed` (hex-decoded), 12 bytes
- **Counter** — uint64, starts at 0

**Combined Seed derivation:**
```
combinedSeed = SHA-512(serverSeed + ":" + clientSeed + ":" + nonce)
```

In Protected mode with WASM layer, `serverSeed` is replaced by `finalSeed` (output of WASM computation).

### 8.2 Canonical JSON

Used for `stateHash` computation. Keys **MUST** be sorted by Unicode code point, recursively. No whitespace. UTF-8 NFC normalization. RFC 8259 escaping.

### 8.3 Data Types

| Field | Type |
|---|---|
| `serverSeed` / `finalSeed` | min 32 bytes, hex-encoded |
| `clientSeed` | UTF-8 string, max 256 bytes |
| `nonce` | uint64, never reused within a serverSeed lifetime |
| `combinedSeed` | SHA-512 output, 128 hex chars |
| `stateHash` | SHA-256 of canonical JSON state |
| `regSeed` | uint32, issued by Registrar (Protected layer only) |
| `gameSeed` | uint32, issued by client |
| `granularity` | `"ALL"` or positive integer |

---

## 9. Session Lifecycle

### 9.1 Session States

| State | Description |
|---|---|
| **PENDING** | Version negotiated, seeds committed. No rounds started. |
| **ACTIVE** | At least one round/tick executed. Audit Trail being written. |
| **MOVE** | Move Mode only. Waiting for player input. Subject to timeout. |
| **REVEALED** | `serverSeed` disclosed and verified. Session closed. |
| **HALTED** | Fatal error. Refund protocol in effect. |

### 9.2 State Transitions

```
PENDING  → ACTIVE   : first round/tick executed
ACTIVE   → MOVE     : waiting for player input (Move Mode)
MOVE     → ACTIVE   : input received within timeout
MOVE     → ACTIVE   : timeout — recorded as SKIP, game continues
ACTIVE   → REVEALED : serverSeed disclosed, verified
ACTIVE   → HALTED   : fatal error (section 12)
```

### 9.3 Move Sync Lifecycle (G = 1)

In multiplayer with `G = 1`, the session cycles rapidly between ACTIVE and MOVE:

```
ACTIVE → MOVE (waiting for players)
       → collect Moves within time window
       → sort deterministically by playerId
       → apply all Moves to state
       → verify stateHash
       → broadcast newState to all players
       → ACTIVE (next tick)
```

**Timeout in Move Sync:** if a player does not submit a Move within the time window, their Move is recorded as `{ type: "skip", playerId, tick }`. The game continues. No refund for skipped Moves.

---

## 10. Seed & Commitment Protocol

### 10.1 Stateless Mode

Standard commit-reveal:

1. Server publishes `serverSeedHash = SHA-256(serverSeed)` **before** play
2. Client publishes `clientSeed` **after** recording commitment
3. `combinedSeed = SHA-512(serverSeed + ":" + clientSeed + ":" + nonce)`
4. Game plays. Outcome determined by `combinedSeed`.
5. Server reveals `serverSeed`. Client verifies `SHA-256(serverSeed) === serverSeedHash`.

### 10.2 Move Mode

Seed **MAY** be revealed **before** play if Input-Seeded Randomness is used (section 5.3). The player's future Moves are unpredictable, so knowing the seed does not enable outcome prediction.

If Input-Seeded Randomness is **not** used, standard commit-reveal applies.

### 10.3 Protected Mode

Seed derivation includes WASM transformation:

1. Registrar issues `regSeed`
2. Client builds WASM from `regSeed`, computes `finalSeed = wasmCompute(gameSeed)`
3. `finalSeed` replaces `serverSeed` in the seed chain
4. All subsequent randomness derives from `finalSeed`
5. Verification: Registrar independently runs `runSpec(regSeed, gameSeed)` and confirms `finalSeed` match

### 10.4 Hash Mismatch

If `SHA-256(serverSeed) !== serverSeedHash`: halt immediately, refund at double stake, append error to Audit Trail. See section 12.

---

## 11. Audit Trail

### 11.1 Session Header

```json
{
  "type":           "uvs-header",
  "uvsVersion":     2,
  "sessionId":      "string",
  "gameMode":       "stateless | move",
  "granularity":    "ALL | 1 | N",
  "inputSeeded":    true,
  "serverSeedHash": "string",
  "clientSeed":     "string",
  "minNonce":       "uint64",
  "params":         "object",
  "extensions":     "string[]",
  "timeout":        "uint32",
  "moveOrdering":   "playerId",
  "players":        ["string"],
  "protected": {
    "regSeed":      "uint32",
    "gameSeed":     "uint32",
    "engineHash":   "string",
    "wasmResult":   "uint32"
  },
  "timestamp":      "string"
}
```

Fields `granularity`, `inputSeeded`, `moveOrdering`, `players` are present only in Move Mode. Field `protected` is present only when Protected layer is active.

### 11.2 Step Record

```json
{
  "step":      "uint64",
  "input":     "object | null",
  "output":    "object",
  "stateHash": "string",
  "rngCalls":  "uint32[]"
}
```

In Move Mode, `input` contains the player's Move (or `null` for no-input ticks). In Move Sync, `input` **MAY** contain Moves from multiple players:

```json
{
  "step": 42,
  "input": {
    "player1": { "x": 3.2, "y": 1.5 },
    "player2": { "x": 7.1, "y": 4.0 }
  },
  "output": { ... },
  "stateHash": "a3f9..."
}
```

### 11.3 Storage Requirements

- **MUST** be append-only
- **MUST** be tamper-evident (detectable via stateHash verification)
- Recommended format: JSONL (one JSON object per line)
- Implementations **SHOULD** chunk at 10,000 steps
- Compression (gzip, zstd) **MAY** be used

---

## 12. Error Codes & Failure Modes

### 12.1 Fatal Errors (MUST halt)

| Code | Description |
|---|---|
| `ERR_HASH_MISMATCH` | `SHA-256(serverSeed) ≠ serverSeedHash`. Halt + double-stake refund. |
| `ERR_VERSION_INCOMPATIBLE` | Version negotiation empty intersection. Session **MUST NOT** start. |
| `ERR_NONCE_REUSE` | Same nonce used twice. Affected rounds refunded. |
| `ERR_RNG_DIVERGENCE` | JS and WASM produced different output. Halt. |
| `ERR_STATE_CORRUPT` | Recomputed stateHash ≠ recorded. Audit Trail invalid from that step. |
| `ERR_WASM_MISMATCH` | WASM computation result ≠ Registrar's `runSpec()`. Protected layer only. |
| `ERR_MOVE_INVALID` | Move received for a tick that has already been processed. Move Sync only. |

### 12.2 Recoverable Conditions (MAY continue)

| Code | Description |
|---|---|
| `WARN_CLIENT_SEED_EMPTY` | clientSeed empty. Session **MAY** proceed with default. |
| `WARN_PLAYER_TIMEOUT` | Player did not submit Move within window. Recorded as SKIP. |
| `WARN_REGISTRAR_OFFLINE` | Registrar unreachable. Game **MAY** proceed with fallback seed. |

---

## 13. Reproducibility Requirements

A game is UVS-compatible if and only if:

- Its simulation is fully deterministic given identical seed and inputs
- Its RNG is fully reproducible from `combinedSeed`
- Its state is serializable to canonical JSON
- Every step is recorded in the Audit Trail
- Its outcome can be independently recalculated by any third party
- In Move Mode: every Move is recorded, and replay produces identical state
- In Move Sync: Move ordering is deterministic and declared

---

## 14. Reference Implementations

| Name | Mode | Granularity | Protected | Status |
|------|------|-------------|-----------|--------|
| Registrar Demo | Stateless | — | Yes (WASM + Registrar) | Production |
| PADDLA | Move | `ALL` (Batch) | Yes (WASM + Registrar) | Production |
| NOISORE | Move | `1` (Sync) | TBD | Planned |

**Registrar Demo** ([registrar.uncloned.work](https://registrar.uncloned.work)): Demonstrates WASM per-session seed transformation and Registrar verification. Each click builds a unique WASM binary, runs it, and submits the result for independent server verification.

**PADDLA** ([paddla.uncloned.work](https://paddla.uncloned.work)): Physics-based arcade. Move Batch mode — player controls a bumper, inputLog recorded locally, sent to Registrar at game end for full engine replay verification. Both WASM check and engine replay are performed. Published on npm as `paddla-engine`.

**NOISORE** ([noisore.uncloned.work](https://noisore.uncloned.work)): Multiplayer water-erosion arcade. Move Sync mode — each player's Move is sent to the server per-tick, verified, and broadcast to other players. First planned implementation of UVS Move Sync. Demonstrates that the same protocol handles single-player batch and multiplayer real-time with only a change in granularity parameter.

---

## 15. Test Vectors

Test vectors from UVS v1 remain valid for v2 Core. See `test-vectors.js` in the repository.

Additional v2 test vectors for Move Mode and WASM layer will be published as implementations mature.

---

## 16. Philosophy

### 16.1 Not a Certificate — a Protocol

UVS replaces the fairness regulator with mathematics. Compliance with applicable law (AML, KYC, licensing) remains the operator's responsibility.

### 16.2 Not Trust — Verification

A player **MUST NOT** have to trust the operator. They **MUST** have the ability to verify independently. In Move Sync, no player needs to trust any other player.

### 16.3 One Engine, Three Roles

The mathematical truth of the game lives in one place. The simulator measures it. The server verifies it. The client shows it. They all run the same code.

### 16.4 One Move = One Game

A single Move is structurally equivalent to a single Stateless game — both are atomic, deterministic, verifiable computations. This unification means one verification protocol works from slots to multiplayer physics games, with only a granularity parameter change.

### 16.5 Out of Scope

Persistent storage, payment processing, infrastructure, identity (KYC/AML), and UI/UX are outside the scope of UVS. UVS guarantees that the computation was fair. Everything above that line is the operator's domain.

---

## 17. Threat Model

### 17.1 Attacks UVS Prevents

- **Seed substitution** — any substitution produces a hash mismatch, triggering halt and refund
- **RNG manipulation** — keystream fully determined by `combinedSeed` via ChaCha20
- **Post-hoc result falsification** — every step produces a `stateHash`; retroactive modification is detectable
- **Move falsification (Move Mode)** — every Move is recorded; replay detects any alteration
- **Engine substitution in production** — Registrar holds certified copy; operator's engine is irrelevant if Registrar disagrees (Protected layer)
- **IP theft** — per-session WASM means extracted code without `regSeed` is operationally useless (Protected layer)
- **Multiplayer cheating (Move Sync)** — server verifies every Move before broadcast; other players can independently verify via replay

### 17.2 Attacks UVS Does Not Prevent

- **Pre-commit collusion** — if operator shares seed before commitment, player can predict outcomes
- **UI substitution** — UVS secures computation, not presentation
- **Incorrect game logic** — UVS guarantees fair RNG and determinism, not balanced game design
- **Payment layer attacks** — deposits, withdrawals outside scope
- **Latency exploitation (Move Sync)** — UVS recommends time-window collection but cannot technically enforce network fairness
- **Cryptographic breaks** — UVS inherits security assumptions of SHA-512 and ChaCha20

### 17.3 Environmental Assumptions

- SHA-512 and ChaCha20 are computationally secure
- Commitment is published before player commits `clientSeed`
- JS reference VM executes in an unmodified runtime
- Audit Trail storage is append-only and tamper-evident
- In Move Sync: server processes Moves in declared deterministic order

---

*UVS v2 · Uncloned Math · April 2026 · [uncloned.work](https://uncloned.work)*

*Constantin Razinsky · constr@gmail.com · Telegram: [@constrik](https://t.me/constrik)*
