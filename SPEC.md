# UVS — Uncloned Verification Standard

**Version 1 · April 2026 · Uncloned Math**

Specification: [github.com/constarik/uvs](https://github.com/constarik/uvs)  
Site: [uncloned.work](https://uncloned.work)  
Design reference: [registrar.uncloned.work](https://registrar.uncloned.work)

---

> **Normative language.** The key words **MUST**, **MUST NOT**, **SHOULD**, **MAY** in this document are to be interpreted as described in RFC 2119.

---

## Table of Contents

1. [Purpose of UVS](#1-purpose-of-uvs)
2. [Architectural Layers](#2-architectural-layers)
3. [Deterministic Execution Model](#3-deterministic-execution-model)
4. [Data Types & PRNG](#4-data-types--prng)
5. [Session Lifecycle](#5-session-lifecycle)
6. [Seed & Commitment Protocol](#6-seed--commitment-protocol)
7. [Audit Trail](#7-audit-trail)
8. [Error Codes & Failure Modes](#8-error-codes--failure-modes)
9. [Reproducibility Requirements](#9-reproducibility-requirements)
10. [Minimal Example](#10-minimal-example)
11. [Test Vectors](#11-test-vectors)
12. [Philosophy of UVS](#12-philosophy-of-uvs)
13. [Threat Model](#13-threat-model)
- [Appendix A — PADDLA Audit Trail](#appendix-a--paddla-audit-trail-physics-arcade-extension)

---

## 1. Purpose of UVS

UVS is a universal protocol for verifiable games, designed to:

- ensure determinism of simulations
- make all random events verifiable
- allow any player or auditor to reproduce gameplay
- eliminate the need for external regulators through mathematically provable fairness

UVS is not a library, not a framework, and not an engine.  
It is a protocol that defines:

- how randomness is generated
- how state is recorded
- how simulation is reproduced
- how fairness is verified

---

## 2. Architectural Layers

### 2.1 UVS Core

The minimal, immutable layer, comprising:

- **Seed Protocol** — randomness generation and disclosure
- **Commitment Scheme** — cryptographic commitments
- **Deterministic VM** — reference virtual machine
- **Audit Trail** — simulation step log

Core has no knowledge of domains (slots, cards, PvP). It defines only how a game must be verifiable.

Design reference: Registrar Protocol (registrar.uncloned.work) — a provably fair two-node architecture that preceded and informed UVS Core.

### 2.2 Domain Extensions

Each game genre or mechanic is packaged as a separate extension:

- Slot Math Extension
- Card Games Extension
- Lootbox Extension
- Turn-Based PvP Extension
- Physics Arcade Extension
- RL-Driven Worlds Extension

Extensions:

- **MUST NOT** modify Core
- describe only domain-specific rules
- are mutually compatible
- **MAY** evolve independently

Minimal extension format — Slot Math Extension example:

```js
// UVS Domain Extension: Slot Math
// extends: UVS Core 1.0+
{
  name:    'slot-math',
  version: '1.0',
  params:  { reels, paylines, rtpTier, bonusFreq },
  step: {
    input:  { bet },
    output: { stops, winLines, bonusTriggered, payout }
  }
}
```

An extension declares its name, minimum UVS Core version, domain-specific params, and the input/output schema for each step. It **MUST NOT** redefine seed, RNG, or Audit Trail behaviour.

---

## 3. Deterministic Execution Model

### 3.1 Reference VM (JS)

The JS implementation of UVS serves as the canonical, verifiable reference VM on which any player or auditor can reproduce a simulation. This does not restrict the protocol to a single language — WebAssembly and other runtimes are compatible — but JS **MUST** remain the canonical layer of truth.

The JS implementation:

- **MUST** run in the browser without additional dependencies
- **MUST** run in Node.js
- **MUST** be the reference against which all other implementations are validated
- **MUST** natively support caller-defined parameters (not delegated to WASM only)

### 3.2 WebAssembly Execution Layer

WASM is an accelerator and industrial backend:

- enables authoring simulation math in Rust / C++ / Zig
- delivers high performance for long verification runs
- **MUST** remain deterministic
- **MUST** produce bit-for-bit identical output to the JS reference

### 3.3 Unbounded Execution

The protocol imposes no upper limit on simulation length. Determinism **MUST** be preserved across any number of steps — from a single round to multi-billion-round verification runs.

### 3.4 Caller-Defined Parameters

The simulation defines an arbitrarily wide range of parameters at initialization (e.g. game mode index, maximum symbol count, volatility tier). These parameters:

- **MUST** be declared before execution begins
- **MUST** be included in the Audit Trail header
- **MUST** be treated as part of the verifiable input alongside the seed
- **MUST** be supported in the JS reference VM natively

### 3.5 Version Negotiation

Each UVS implementation declares an explicit set of supported integer versions. A session **MUST NOT** start until a version is negotiated. Versions are positive integers, monotonically increasing (1, 2, 3, …). Sets are used instead of ranges to allow explicit exclusion of broken or deprecated versions.

**Negotiation algorithm:**

- `intersection = clientVersions ∩ serverVersions`
- `negotiated   = max(intersection)` — highest version in intersection
- if intersection is empty → **MUST** reject

**Example (successful):**
```
Client versions: [1, 2, 3, 5, 7]
Server versions: [3, 4, 5, 7, 8]
intersection   : [3, 5, 7]
negotiated     : 7  ✓
```

**Example (with excluded broken version 6):**
```
Client versions: [1, 2, 3, 5, 7]   // 6 excluded (known broken)
Server versions: [3, 5, 7]           // 6 also excluded
intersection   : [3, 5, 7]
negotiated     : 7  ✓
```

**Example (reject):**
```
Client versions: [1, 2, 3]
Server versions: [10, 11, 12]
intersection   : empty → reject
```

**Handshake:**
```json
Client → Server: { "versions": [1, 2, 3, 5, 7] }
Server → Client: { "negotiated": 7, "accepted": true, "serverVersions": [3, 5, 7, 8] }
          or:    { "accepted": false, "serverVersions": [10, 11, 12] }
```

The server **MUST** always return `serverVersions` in both accepted and rejected responses. On success, the client uses these values to understand the server's full capability range. On reject, the client uses them to determine whether to upgrade or downgrade.

The negotiated version **MUST** be recorded in the Audit Trail header.

**Reference implementation (JS):**
```js
function negotiate(clientVersions, serverVersions) {
  const intersection = clientVersions.filter(v => serverVersions.includes(v));
  if (!intersection.length) return null;
  return Math.max(...intersection);
}
```

### 3.6 Versioning Semantics

A change to UVS Core or a Domain Extension **MUST** be classified as either breaking or non-breaking before a new version is published.

**Breaking changes (MUST increment version):**

- Any change to the Canonical JSON format
- Any change to the combinedSeed derivation algorithm
- Any change to the PRNG algorithm or initialisation
- Any change to the Audit Trail step structure that removes or renames a field
- Any change to the hash mismatch halt-and-refund protocol
- Any change to the version negotiation handshake format

**Non-breaking changes (MAY increment version, MUST NOT break existing implementations):**

- Adding optional fields to the Audit Trail step or header
- Adding new error codes
- Adding new Domain Extensions
- Clarifications to normative text that do not alter behaviour

**Extension versioning relative to Core:**

- Each Domain Extension declares the minimum UVS Core version it requires
- An extension **MUST NOT** require a Core version higher than the negotiated session version
- If client supports extension version E and server supports E′ where E ≠ E′, the same negotiation algorithm (section 3.5) applies independently to the extension version
- An extension version mismatch that yields an empty intersection **MUST** produce `ERR_VERSION_INCOMPATIBLE` for that extension; the session **MAY** continue without that extension if both parties agree

---

## 4. Data Types & PRNG

### 4.0 Canonical JSON

Canonical JSON is used for stateHash computation and Audit Trail serialization. All implementations **MUST** conform to the following rules:

- **Key sorting:** object keys **MUST** be sorted by Unicode code point value. Sorting is applied recursively to all nested objects.
- **Whitespace:** **MUST** be omitted. No spaces, tabs, or newlines between tokens.
- **String escaping:** **MUST** follow RFC 8259. Only `"` (\\u0022), `\` (\\u005C), and control characters U+0000–U+001F **MUST** be escaped.
- **Numbers:** **MUST** be represented without trailing zeros. Integers **MUST NOT** use floating-point notation.
- **Encoding:** **MUST** be UTF-8, no BOM.
- **Unicode normalization:** All string values **MUST** be normalized to NFC before serialization. NFD, NFKC, NFKD forms **MUST NOT** be produced or accepted.

Reference (JS — flat objects only):
```js
JSON.stringify(state, Object.keys(state).sort())
```
For nested objects, sorting **MUST** be applied recursively (see section 10 `canonicalJSON()`).

### 4.1 PRNG Specification

All UVS implementations **MUST** use ChaCha20 as the pseudorandom number generator.

**Initialisation:**

- **Key** — first 32 bytes of combinedSeed (hex-decoded)
- **Nonce** — bytes 32–43 of combinedSeed (hex-decoded), 12 bytes, big-endian
- **Counter** — uint64, starts at 0, incremented per 64-byte block

**Output:**

- Each call to `rng.nextUint32()` **MUST** consume 4 bytes from the ChaCha20 keystream
- Bytes are consumed in order; the keystream **MUST NOT** be rewound or reused

**`rng.consumed()` specification:**

- **MUST** return an array of uint32 values in the order they were produced
- **MUST** include every value returned by `nextUint32()` since initialisation
- **MUST NOT** include values generated but not yet consumed by the simulation
- **MUST** be callable at any point and reflect current consumption state
- After `rng.consumed()` is called, the internal log **MUST NOT** be reset

**Reference implementation (JS):**

```js
class UVS_PRNG {
  constructor(combinedSeed) {
    const buf    = Buffer.from(combinedSeed, 'hex')  // 64 bytes
    this._key    = buf.slice(0, 32)
    this._nonce  = buf.slice(32, 44)
    this._log    = []
    this._pos    = 0
    this._stream = chacha20Keystream(this._key, this._nonce)
  }
  nextUint32() {
    const val = this._stream.readUInt32LE(this._pos)
    this._pos += 4
    this._log.push(val)
    return val
  }
  consumed() {
    return [...this._log]  // return copy, do not reset
  }
}
```

**Conformance:**

- Implementations **MUST** pass the RFC 8439 ChaCha20 test vectors
- WASM and JS **MUST** produce identical keystreams given identical key and nonce
- The PRNG **MUST** be stateless between steps — each step initialises a fresh `UVS_PRNG` from that step's `combinedSeed`

### 4.2 Data Types

| Field | Type |
|---|---|
| `SHA256()` | SHA-256, hex-encoded, lowercase, 64 characters |
| `SHA512()` | SHA-512, hex-encoded, lowercase, 128 characters |
| `serverSeed` | cryptographically random bytes, min 32 bytes, hex-encoded |
| `clientSeed` | UTF-8 string, max 256 bytes |
| `nonce` | uint64, incremented per round, never reused within a serverSeed lifetime |
| `combinedSeed` | SHA-512(serverSeed + ":" + clientSeed + ":" + nonce) — 128 hex chars |
| `key` | bytes 0–31 of combinedSeed, ChaCha20 key |
| `nonce12` | bytes 32–43 of combinedSeed, ChaCha20 nonce |
| `stateHash` | SHA-256 of canonical JSON of state, keys sorted by Unicode code point |
| `step` | uint64, monotonically increasing |
| `rngCalls` | uint32[], PRNG values consumed in this step, in call order |
| `params` | JSON object, keys sorted, declared at simulation initialization |

---

## 5. Session Lifecycle

### 5.1 Session Definition

A session is the atomic unit of UVS execution. It begins when both parties have committed their seeds and a version has been negotiated. It ends when the serverSeed is revealed or when a fatal error occurs.

```
sessionId = SHA-256(serverSeedHash + ":" + clientSeed + ":" + minNonce)
```

where `minNonce` is the first nonce value used in the session.

### 5.2 Session States

| State | Description |
|---|---|
| **PENDING** | version negotiated, serverSeedHash published, clientSeed received. No rounds started. |
| **ACTIVE** | at least one round executed. Audit Trail is being written. |
| **MOVE** | multiplayer only. Waiting for a specific player's input. Subject to per-move timeout. |
| **REVEALED** | serverSeed disclosed and verified. Session closed. Audit Trail final. |
| **HALTED** | fatal error occurred. Refund protocol in effect. Audit Trail sealed with error record. |

**State transitions:**
```
PENDING  → ACTIVE   : first round executed
ACTIVE   → MOVE     : multiplayer — awaiting input from a specific player (repeating)
MOVE     → ACTIVE   : input received within timeout
MOVE     → ACTIVE   : timeout expired — move recorded as SKIP, game continues
ACTIVE   → REVEALED : operator discloses serverSeed, SHA256(serverSeed) == serverSeedHash
ACTIVE   → HALTED   : fatal error detected (section 8.1)
PENDING  → HALTED   : fatal error before first round
HALTED   → terminal
REVEALED → terminal
```

**MOVE timeout policy:**

- The timeout value per move **MUST** be declared in the session header
- On timeout, the missing move **MUST** be recorded in the Audit Trail as `{ type: "skip", playerId, tick }`
- The game **MUST** continue without the missing player's input for that move
- The skipped move **MUST** be deterministically substitutable — implementations **SHOULD** use a fixed fallback input (e.g. `null` or a declared default) derived from the session seed
- A player who misses a move does not receive a refund — timeout is the player's responsibility

**Single-player timeout policy:**

- If the session is single-player and verify is not received within TTL, the stake is forfeited — no refund
- Refund applies only on server-side fault (`ERR_HASH_MISMATCH`)

### 5.3 Connection Loss

If the connection is interrupted the server **MUST NOT** advance session state until connection is restored and **MUST** preserve the Audit Trail in its current state.

**Multiplayer (MOVE state):** if not restored within the move timeout, the move is recorded as `{ type: "skip", playerId, tick }` and the game continues. No refund for skipped moves.

**Single-player:** if verify is not received within TTL, the stake is forfeited. Refund applies only on server-side fault (`ERR_HASH_MISMATCH`).

The timeout value **MUST** be declared in the session header.

---

## 6. Seed & Commitment Protocol

### 6.1 Commit Phase

The operator **MUST** publish before any round begins:

```
serverSeedHash = SHA-256(serverSeed)
```

The player **MUST** publish before any round begins:

```
clientSeed
```

Both values **MUST** be committed and immutable for the duration of the session.

### 6.2 Reveal Phase

After the session concludes:

- the operator **MUST** disclose `serverSeed`
- any participant **MUST** be able to verify: `SHA-256(serverSeed) == serverSeedHash`

### 6.3 Combined Seed

```
combinedSeed = SHA-512(serverSeed + ":" + clientSeed + ":" + nonce)
```

SHA-512 produces 64 bytes: bytes 0–31 → ChaCha20 key; bytes 32–43 → ChaCha20 nonce. This eliminates the need for secondary key derivation.

Used for: RNG initialisation, shuffle, procedural generation, any deterministic operation within the simulation.

### 6.4 Hash Mismatch Protocol

Upon detection of `SHA-256(serverSeed) != serverSeedHash`:

- The simulation **MUST** halt immediately
- A dispute record **MUST** be appended to the Audit Trail (timestamp, last valid stateHash, mismatched values)
- All active rounds **MUST** be refunded at **double the stake value** recorded in the last valid stateHash entry — the penalty multiplier compensates the player for the operator's fault
- Unverified outcomes **MUST NOT** be paid out

The double-stake penalty creates an economic incentive for operators to maintain correct seed management. The penalty multiplier (default: 2×) **MAY** be overridden by the operator in the session header; the declared value is binding for the session.

The protocol is responsible only for detection, halt, and refund calculation. Diagnosis and payment are the responsibility of the operator.

---

## 7. Audit Trail

### 7.1 Step Record

Each simulation step **MUST** be recorded with the following structure:

```json
{
  "step":      "uint64",    // monotonically increasing step index
  "params":    "object",    // caller-defined parameters (declared at init)
  "input":     "object",    // player action or external event for this step
  "output":    "object",    // outcome, payouts, state delta
  "stateHash": "string",    // SHA-256 of canonical JSON state after this step
  "rngCalls":  "uint32[]"   // all PRNG values consumed, in call order
}
```

### 7.2 Session Header

The Audit Trail **MUST** begin with a header record:

```json
{
  "type":           "uvs-header",
  "uvsVersion":     1,              // negotiated UVS version, integer
  "sessionId":      "string",    // SHA-256(serverSeedHash+":"+clientSeed+":"+minNonce)
  "serverSeedHash": "string",    // SHA-256 of serverSeed, hex 64 chars
  "clientSeed":     "string",    // UTF-8, max 256 bytes
  "minNonce":       "uint64",    // first nonce value for this session
  "params":         "object",    // caller-defined parameters, canonical JSON
  "extensions":     "string[]",  // active domain extensions e.g. ["slot-math@1.0"]
  "timeout":        "uint32",    // connection loss timeout in seconds
  "timestamp":      "string"     // ISO 8601 UTC session start time
}
```

The Audit Trail enables:

- full game replay from any step
- independent fairness verification
- detection of any discrepancy between recorded and recomputed state

### 7.3 Audit Trail Storage

**Normative requirements:**

- Storage **MUST** be append-only — existing entries **MUST NOT** be modified or deleted
- Storage **MUST** be tamper-evident — modifications **MUST** be detectable via stateHash verification
- The header **MUST** be stored as the first entry
- Entries **MUST** be stored in step order with no gaps

**Recommended format — JSONL:**
```
{ header }                        // line 0: session header
{ "step":0, "params":..., ... }   // line 1: step 0
{ "step":1, "params":..., ... }   // line 2: step 1
```

**Chunking:**

- Implementations **SHOULD** chunk Audit Trails into segments of at most 10,000 steps
- Each chunk **MUST** begin with the header and the first step of that chunk
- Chunk filenames **SHOULD** follow: `audit_{sessionId}_{chunkIndex}.jsonl`

**Compression:**

- Implementations **MAY** compress chunks using gzip or zstd
- Compressed files **MUST** use `.jsonl.gz` or `.jsonl.zst` extension
- Compression **MUST NOT** alter the canonical JSON content

**Merkleization (optional):**

- Implementations **MAY** construct a Merkle tree over stateHash values for O(log n) inclusion proofs
- The Merkle root **MAY** be published independently as a compact session fingerprint
- If used, the algorithm and tree structure **MUST** be declared in the Audit Trail header

### 7.4 Domain-Specific Audit Trail

The step record defined in section 7.1 is the canonical format for general-purpose UVS implementations. However, for specific game classes the format **MAY** be adapted, provided that:

- `stateHash` is present on every recorded step
- the recorded data is sufficient to independently reproduce and verify any disputed outcome
- the adaptation is documented in a domain-specific appendix referenced in the session header

This allows implementations to omit fields that are structurally redundant for their domain (e.g. `rngCalls` in physics engines that do not use ChaCha20 directly) without losing verifiability.

---

## 8. Error Codes & Failure Modes

### 8.1 Fatal Errors (MUST halt)

| Code | Description |
|---|---|
| `ERR_HASH_MISMATCH` | SHA-256(serverSeed) ≠ serverSeedHash. Triggers halt + refund (section 6.4). |
| `ERR_VERSION_INCOMPATIBLE` | Version negotiation produced empty intersection. Session MUST NOT start. |
| `ERR_NONCE_REUSE` | Same nonce used twice within a serverSeed lifetime. All affected rounds MUST be refunded. |
| `ERR_RNG_DIVERGENCE` | JS and WASM produced different output for identical input. MUST stop until resolved. |
| `ERR_STATE_CORRUPT` | Recomputed stateHash does not match recorded value. Audit Trail invalid from that step. |

### 8.2 Recoverable Conditions (MAY continue)

| Code | Description |
|---|---|
| `WARN_CLIENT_SEED_EMPTY` | clientSeed is empty. Session MAY proceed with default value; MUST be recorded in header. |
| `WARN_PARAMS_UNKNOWN_KEY` | params contain unrecognised key. MUST be ignored and recorded as-is. |
| `WARN_STEP_LIMIT_APPROACHED` | step count approaches uint64 maximum. Operator SHOULD rotate serverSeed. |

### 8.3 Error Record Format

Fatal errors **MUST** append an error record to the Audit Trail before halting:

```json
{
  "error":              "string",  // error code e.g. ERR_HASH_MISMATCH
  "step":               "uint64",  // step at which the error occurred
  "timestamp":          "string",  // ISO 8601 UTC
  "detail":             "object",  // error-specific diagnostic data
  "lastValidStateHash": "string"   // stateHash of last verified step
}
```

---

## 9. Reproducibility Requirements

### 9.1 Single Execution

A game is considered UVS-compatible if and only if:

- its simulation is fully deterministic given identical seed and params
- its simulation **MUST** run for an arbitrary number of steps without loss of determinism
- its RNG is fully reproducible from `combinedSeed`
- its state is serializable to canonical JSON
- every step is recorded in the Audit Trail in the specified format
- its caller-defined parameters are declared prior to execution and recorded in the Audit Trail header
- its outcome can be independently recalculated by any third party
- its JS reference VM supports caller-defined parameters natively

### 9.2 Simulation

A simulation is N consecutive executions of the same UVS-compatible game engine. Because each execution is a single verifiable run, simulation is structurally identical to single execution — it requires no additional protocol machinery.

Simulation parameters are game-dependent and declared in the session header `params` field. Examples:

| Domain | Simulation Parameters |
|---|---|
| Slot Math | `{ rtpTier, betPerSpin, numSpins }` |
| Physics Arcade | `{ numBalls, betPerBall, strategy, numGames }` |
| Card Games | `{ numHands, deckCount, betPerHand }` |

A simulation run **MUST** produce the same aggregate statistics given identical seed sequence and params. The aggregate output (e.g. RTP, hit rate, max win) **MUST** be reproducible and verifiable by any third party using the same inputs.

Simulation services **MAY** be offered as a paid endpoint by the operator. Rate limiting, quota management, and billing are outside the scope of UVS.

---

## 10. Minimal Example

```js
// UVS Reference VM (JS)
// SHA256(x) = crypto.createHash('sha256').update(x).digest('hex')
// SHA512(x) = crypto.createHash('sha512').update(x).digest('hex')

// canonicalJSON: recursive key sort, no whitespace, UTF-8 NFC, RFC 8259 escaping
function canonicalJSON(obj) {
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJSON).join(',') + ']'
  if (obj !== null && typeof obj === 'object') {
    const keys = Object.keys(obj).sort()  // Unicode code point order
    return '{' + keys.map(k =>
      JSON.stringify(k.normalize('NFC')) + ':' + canonicalJSON(obj[k])
    ).join(',') + '}'
  }
  return JSON.stringify(obj)  // numbers, strings, booleans, null
}

function runSimulation(serverSeed, clientSeed, startNonce, params, maxSteps) {

  // params: e.g. { gameMode: 2, maxDiamonds: 5, volatilityTier: 'high' }
  const serverSeedHash = SHA256(serverSeed)
  const sessionId      = SHA256(serverSeedHash + ':' + clientSeed + ':' + startNonce)

  const auditTrail = {
    header: {
      type: 'uvs-header', uvsVersion: 1, sessionId,
      serverSeedHash, clientSeed, minNonce: startNonce,
      params, extensions: [], timeout: 30,
      timestamp: new Date().toISOString()
    },
    steps: []
  }

  let state = initialState(params)

  for (let step = 0; step < maxSteps; step++) {
    const nonce        = startNonce + BigInt(step)
    const combinedSeed = SHA512(serverSeed + ':' + clientSeed + ':' + nonce)
    const rng          = new UVS_PRNG(combinedSeed)
    const input        = getInput(step)
    const output       = simulate(state, input, rng, params)

    // Hash mismatch check: halt and refund
    if (SHA256(serverSeed) !== auditTrail.header.serverSeedHash)
      return halt(auditTrail, step)   // refund stake from last valid stateHash

    auditTrail.steps.push({
      step, params, input, output,
      stateHash: SHA256(canonicalJSON(state)),
      rngCalls:  rng.consumed()
    })
  }
  return auditTrail
}
```

---

## 11. Test Vectors

All UVS implementations **MUST** reproduce the following values exactly.

### 11.1 Inputs

| Field | Value |
|---|---|
| `serverSeed` | `deadbeefcafebabe0102030405060708090a0b0c0d0e0f101112131415161718` |
| `clientSeed` | `player_seed_42` |
| `nonce` | `1` |
| `params` | `{"gameMode":2,"maxDiamonds":5,"volatilityTier":"high"}` |
| `input` | `{"bet":100,"playerAction":"spin"}` |

### 11.2 Vector 1 — serverSeedHash

```
SHA-256(serverSeed) =
0dc3c92d4a8b8c6cab67eee53e8177f679e5efa47cce6eb741255466f8dfcf3e
```

### 11.3 Vector 2 — sessionId

```
SHA-256(serverSeedHash + ":" + clientSeed + ":" + minNonce) =
b2332394bde343fb52bd8ff036c4558a29b480733c0d8973f2c78bfa8966fc35
```

### 11.4 Vector 3 — combinedSeed

```
SHA-512(serverSeed + ":" + clientSeed + ":" + nonce) =
446a9c96178ffba4ccceaf7fcd9682b477cdbad1ec6d2c2406a68223c807d111
13824954467e8df504de08aa61ce27b0901f6f35a5661c759c6c338f0e817a99

key   (bytes 0–31)  : 446a9c96178ffba4ccceaf7fcd9682b477cdbad1ec6d2c2406a68223c807d111
nonce (bytes 32–43) : 13824954467e8df504de08aa
```

### 11.5 Vector 4 — ChaCha20 keystream (counter = 0)

| Index | Decimal | Hex |
|---|---|---|
| rngCalls[0] | 618181213 | 0x24d8b25d |
| rngCalls[1] | 145813622 | 0x08b0f076 |
| rngCalls[2] | 1951481150 | 0x74513d3e |
| rngCalls[3] | 3878276046 | 0xe729cbce |
| rngCalls[4] | 36465895 | 0x022c6ce7 |
| rngCalls[5] | 1329852316 | 0x4f43ef9c |
| rngCalls[6] | 500724006 | 0x1dd87126 |
| rngCalls[7] | 987159170 | 0x3ad6da82 |

### 11.6 Vector 5 — Full simulation step

`outcome = (rngCalls[0] % 6) + 1 = (618181213 % 6) + 1 = 2`

| Field | Value |
|---|---|
| `output` | `{"outcome":2,"payout":0}` |
| `state JSON` | `{"balance":900,"step":1}` |
| `stateHash` | `5e1fc7e7a541ecb9c8ed55c21950f40d5b7d06f79d8b9e4dcede9636520c3ce6` |

stateHash = SHA-256 of canonical JSON with keys sorted alphabetically.

---

## 12. Philosophy of UVS

### 12.1 Not a Certificate — a Protocol

UVS does not require a certification body to guarantee fairness. It replaces the fairness regulator with mathematics. Compliance with applicable law — including AML, KYC, and jurisdictional licensing — remains the responsibility of the operator.

### 12.2 Not Trust — Verification

A player **MUST NOT** have to trust the operator. They **MUST** have the ability to verify independently.

### 12.3 Not a Monolith — an Ecosystem

UVS is:

- a core protocol
- domain extensions
- a JS reference VM
- tooling
- an open-source ecosystem

### 12.4 Out of Scope

The following are explicitly outside the scope of UVS and any conforming implementation:

- **Persistent storage** — how and where Audit Trail data is stored is the operator's decision
- **Payment processing** — deposits, withdrawals, and refund execution are the operator's responsibility
- **Infrastructure** — hosting, scaling, availability, and disaster recovery are outside the protocol
- **Identity** — KYC, AML, and jurisdictional compliance are the operator's legal obligation
- **UI/UX** — UVS secures the computation layer, not the presentation layer

UVS guarantees that the computation was fair. Everything above that line is the operator's domain.

### 12.5 Implementation Versioning

An implementation of UVS is identified by three values:

```
UVS version          : integer  (protocol version, e.g. 1)
Implementation number: integer  (implementation identifier, e.g. 1)
Implementation version: semver  (release of this implementation, e.g. 9.0.8)
```

The major component of the implementation version **MUST** match the engine version (`ENGINE_VERSION`). This constraint **MUST** be enforced programmatically before any release — a version mismatch **MUST** abort the release process.

Example: `ENGINE_VERSION = 9` requires implementation version `9.x.x`. Releasing `10.0.0` with `ENGINE_VERSION = 9` is a violation.

---

## 13. Threat Model

### 13.1 Attacks UVS Prevents

- **Seed substitution after commit.** Any substitution produces a hash mismatch, triggering halt and refund (section 6.4).
- **RNG manipulation.** The keystream is fully determined by combinedSeed via ChaCha20. No party can bias the output without knowledge of all three inputs.
- **Post-hoc result falsification.** Every step produces a stateHash. Any retroactive modification is detectable by recomputing the hash chain.
- **Replay with altered nonce.** Replaying with a different nonce produces a different keystream and stateHash, making substitution detectable.
- **Silent RNG divergence between JS and WASM.** Both **MUST** produce bit-for-bit identical output. Test vectors (section 11) provide a conformance baseline.

### 13.2 Attacks UVS Does Not Prevent

- **Pre-commit collusion.** If the operator shares serverSeed before the round, the player can predict outcomes. UVS cannot detect social-layer collusion.
- **Deliberate hash mismatch as denial of payout.** UVS mandates refund but cannot enforce payout above stake. This is a governance problem, not a protocol problem.
- **UI substitution.** UVS secures the computation, not the presentation layer.
- **Incorrect domain logic.** UVS guarantees fair RNG and deterministic execution. It does not validate game rules. A game with a biased paytable passes UVS compliance.
- **Payment layer attacks.** Manipulation of deposits or withdrawals is outside the scope of UVS.
- **Cryptographic breaks.** UVS inherits the security assumptions of SHA-512 and ChaCha20.

### 13.3 Environmental Assumptions

- SHA-512 and ChaCha20 are computationally secure against all known attacks
- The operator publishes `serverSeedHash` before the player commits `clientSeed` — the protocol cannot enforce this technically, only verify it after the fact
- The player observes `serverSeedHash` before placing a stake
- The system clock is sufficiently accurate to produce meaningful timestamps in dispute records
- The JS reference VM executes in an unmodified, trusted runtime
- Audit Trail storage is append-only and tamper-evident

---

*UVS v1 · Uncloned Math · April 2026 · uncloned.work*

---

## Appendix A — PADDLA Audit Trail (Physics Arcade Extension)

This appendix defines the domain-specific Audit Trail format for PADDLA, a physics arcade game using the UVS Physics Arcade Extension. It is referenced in the PADDLA session header as `"extensions": ["physics-arcade@1"]`.

### A.1 Overview

PADDLA's engine is deterministic given two inputs: `serverSeed` (derived from WASM computation over `regSeed` + `gameSeed`) and `inputLog` (bumper positions per tick, provided by the client). The Registrar performs a full replay and can detect any divergence.

Because PADDLA does not use ChaCha20 directly (it uses LCG + SHA-256 for state hashing), the standard `rngCalls` field is not applicable. Instead the Audit Trail records:

- full `inputLog` — bumper target per tick
- event-only `eventLog` — ticks where game events occurred, with `stateHash`

### A.2 Session Header Extension

```json
{
  "type":           "uvs-header",
  "uvsVersion":     1,
  "extensions":     ["physics-arcade@1"],
  "sessionId":      "string",
  "serverSeedHash": "string",
  "clientSeed":     "string",
  "regSeed":        "uint32",
  "gameSeed":       "uint32",
  "numBalls":       "uint32",
  "betPerBall":     "number",
  "timeout":        30,
  "timestamp":      "string"
}
```

### A.3 Input Log

One entry per tick, for the full duration of the game:

```json
{ "tick": "uint64", "target": { "x": "float", "y": "float" } | null }
```

`null` target means no input was provided for that tick (bumper held in place).

### A.4 Event Log

One entry per tick where at least one game event occurred:

```json
{
  "tick":      "uint64",
  "events":    "string[]",
  "stateHash": "string",
  "totalWin":  "number"
}
```

`events` contains event type names: `spawn`, `goal`, `bumperHit`, `collision`, `timeout`, `explosion`, `gameEnd`.

`stateHash` = SHA-256 of canonical JSON of: `{ ballsOnField, ballsSpawned, progressive, totalWin }`.

### A.5 Verification Protocol

Upon receiving a dispute:

1. Registrar recomputes `serverSeed` from `regSeed` + `gameSeed` via WASM spec
2. Registrar replays the full game using `serverSeed` + `inputLog`
3. On each event tick, Registrar computes `stateHash` and compares with client's `eventLog`
4. First divergence is reported as `firstMismatch: { tick, event, clientHash, serverHash }`
5. If `serverTotalWin ≠ clientTotalWin` → mismatch detected

A mismatch indicates either a bug in the engine (reproducible across all clients) or a tampered client engine (isolated to this session).
