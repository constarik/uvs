# UVS v3 — Design Notes

**Status:** Draft · Target release: before July 2026 · Blocked on: NOISORE Move Sync reference implementation

This document records design decisions taken for the upcoming UVS v3 revision. It exists so that:

1. Readers of the current v2 `SPEC.md` can see the direction of travel
2. The author does not have to reconstruct context between sessions
3. When v3 is finalized, these notes become the mechanical patchlist for `SPEC.md`

v3 is a **major version bump**, not a minor patch. Rationale: the Move Protocol acquires mandatory asymmetric-cryptography requirements. Any v2 Move Mode implementation is not forward-compatible without added ed25519 signing infrastructure.

---

## 1. SHA-512 for combinedSeed — retained

**Question raised:** why SHA-512 (64 bytes) when ChaCha20 consumes only 32 (key) + 12 (nonce) = 44 bytes? The remaining 20 bytes appear wasted.

**Resolution:** retained as-is.

SHA-512 produces exactly 64 bytes that align with ChaCha20 inputs without secondary key derivation: bytes 0–31 are the key, bytes 32–43 are the nonce. The remaining 20 bytes form a reserved region for future protocol extensions (domain separation, multi-key derivation, auxiliary PRFs). SHA-512 also has a fast native implementation in Node.js and most modern runtimes.

No change to `SPEC.md`.

---

## 2. Enforcement and anti-equivocation in Move Sync — major addition

**Problem:** v2 Section 5.6 states that "any player can catch a dishonest server by replaying the Move sequence locally." But detection alone is insufficient:

1. If the server transmits the Audit Trail to a player after the session, the server can send an edited version that "verifies." This is **log equivocation** — a single actor presenting different histories to different parties.
2. A plain numeric sequence of moves, even with hash-chaining, does not prove authorship. Any party can fabricate a compatible-looking local log post-hoc.
3. Without cryptographic attribution, disputes reduce to unprovable he-said / she-said.

**Resolution:** v3 adds mandatory cryptographic accountability to Move Mode.

### 2.1 Player-side signatures

At session start, the player client generates an ephemeral ed25519 keypair locally. The private key **MUST NOT** leave the client. The public key is transmitted to the server in the session header.

Each move is signed:

```
signed_move = ed25519_sign(
  playerPrivKey,
  canonical({ sessionId, seq, move })
)
```

Three fields, all necessary:

- `sessionId` — binds the signature to this session (prevents cross-session replay)
- `seq` — monotonic per-player move counter (enables ordering and gap detection)
- `move` — the move payload itself (the actual content being authorized)

The server cannot forge player moves without the player's private key.

### 2.2 Sequential processing (MUST)

The server **MUST** process signed_moves from each player in strict `seq` order. A `signed_ack` with seq=N is a cryptographic commitment that all moves with seq < N from that player have been received, validated, and included in the Audit Trail.

The server **MUST NOT** issue `signed_ack` for seq=N if any earlier seq from the same player is missing.

This rule eliminates the need for explicit `last_seen_seq` fields — an ack on N is, by protocol, an implicit ack for all preceding seq values.

### 2.3 Server-side acknowledgment

On accepting a signed_move, the server **MUST** return a signed acknowledgment:

```
signed_ack = ed25519_sign(
  serverPrivKey,
  canonical({ sessionId, seq, move_hash })
)
```

The `move_hash` field binds the ack to the specific move content (not just its sequence number), preventing substitution attacks.

The server keypair's public key **MUST** be known to the client prior to ack verification (published via Registrar, session metadata, or ENGINE_HASH registry).

### 2.4 Public Audit Trail publication

After session completion, the server **MUST** publish the full Audit Trail to a publicly accessible append-only location. Acceptable channels include (non-normative examples):

- Blockchain transaction carrying trail hash
- Transparency log (CT-style)
- Content-addressed storage (IPFS) with external timestamp proof
- Public HTTPS endpoint under server's own domain (weakest; server owns the endpoint)

The server **MUST** provide the player at session end with:

```
{
  auditTrailURL,
  auditTrailHash,
  signature: ed25519_sign(serverPrivKey, canonical({ sessionId, auditTrailURL, auditTrailHash }))
}
```

The hash enables verification independent of URL availability.

### 2.5 Player-side local storage

The player **MUST** retain locally, for the duration of the session and through any dispute window:

- All signed_moves sent
- All signed_acks received
- The final `{auditTrailURL, auditTrailHash, signature}` from the server

This local record is the player's evidence in case of server misbehavior.

### 2.6 Scope of guarantees

This construction addresses:

| Attack | Defense |
|---|---|
| Server fabricates moves not made by player | Missing signed_move with player's key |
| Server substitutes move content | move_hash in ack does not match |
| Server omits accepted move | Player holds signed_ack without matching trail entry |
| Server shows different trails to different parties | Single public publication; equivocation detectable |
| Server mutates trail after publication | Append-only channel + hash commitment |
| Server claims move not received | Sequential processing: ack on seq=N+1 implies receipt of seq=N |

### 2.7 Not addressed

- Network delivery failures before server receives move (legitimate packet loss) — resolved by client retry with dedup via seq
- Disputes over game logic correctness (separate from RNG/fairness scope)
- Grief attacks through false dispute claims (reputation/economic layer, out of UVS scope)

---

## 3. WASM security claim — softened with explicit assumption

**Problem:** v2 Section 6.1 states that "extracting the client code without regSeed is **operationally useless**." This claim depends on assumptions not stated in the spec: entropy of `regSeed`, diversity of the WASM generator's output space, and computational cost of precomputation.

**Resolution:** soften the wording and add explicit assumptions. Formal requirements deferred to a later revision.

### Patch to Section 6.1

**Before:**

> **Security property:** extracting the client code without `regSeed` is operationally useless. The attacker has a WASM **generator**, but without the Registrar-issued `regSeed`, they cannot predict which WASM will execute in any given session.

**After:**

> **Security property:** extracting the client code without `regSeed` is **operationally difficult**. The attacker obtains a WASM **generator**, but without the Registrar-issued `regSeed`, they cannot predict which WASM will execute in any given session.
>
> The strength of this property depends on two assumptions: (a) `regSeed` carries sufficient entropy to make exhaustive precomputation impractical, and (b) the WASM generator produces binaries whose computational behavior for different `regSeed` values is statistically indistinguishable. Formal requirements for `regSeed` entropy and generator diversity are reserved for a future specification revision.

---

## 4. "One Move = One Game" vs multiplayer reality — clarified

**Problem:** v2 Section 5.1 presents "One Move = One Game" as the central unification principle. But Section 5.4 correctly notes that in multiplayer Move Sync, individual Moves cannot be verified in isolation because their effects are coupled through shared state. The atomic verification unit in Sync is the **tick** (the collection of all players' moves at that tick), not the individual Move.

**Resolution:** retain the slogan; clarify the scoping rule where it appears.

### Patch to Section 5.1 (extend final paragraph)

After "The only difference is scope: Stateless verifies the entire game at once; Move verifies one step at a time." add:

> In multiplayer Move Sync, the atomic verification unit is a **tick** — the collection of all Moves from all players at the same tick — because each Move's effect is coupled to others through shared state. The principle is unchanged; the unit scales from a single-player Move to a multi-player tick. The same verification machinery applies.

### Patch to Section 5.4 (soften opposition)

**Before:**

> In multiplayer, individual Moves cannot be verified in isolation — each Move's effect depends on all other players' Moves at the same tick.

**After:**

> In multiplayer, individual Moves cannot be verified **in isolation**; the verification unit is the full tick (all Moves from all players at the same tick), because each Move's effect depends on the others through shared state.

### Patch to Section 16.4 (preserve slogan, add scope note)

**Before:**

> ### 16.4 One Move = One Game
> A single Move is structurally equivalent to a single Stateless game — both are atomic, deterministic, verifiable computations. This unification means one verification protocol works from slots to multiplayer physics games, with only a granularity parameter change.

**After:**

> ### 16.4 One Move = One Game
> A single Move is structurally equivalent to a single Stateless game — both are atomic, deterministic, verifiable computations. In multiplayer Move Sync, the unit scales from Move to Tick; the principle is the same. This unification means one verification protocol works from slots to multiplayer physics games, with only a granularity parameter change.

---

## 5. clientSeed in Protected mode — retained

**Problem:** v2 Section 10.3 states "finalSeed replaces serverSeed in the seed chain" but does not specify what happens to `clientSeed`. In Stateless (10.1), the commit-reveal flow uses `serverSeed + clientSeed + nonce`. In Protected, the fate of `clientSeed` is left ambiguous.

**Resolution:** `clientSeed` is retained with the same commit-reveal protocol as Stateless. WASM transformation replaces `serverSeed` with `finalSeed`, but player contribution to randomness is preserved.

Rationale:

1. Compatibility — all invariants of the Stateless commit-reveal flow remain intact.
2. Defense in depth — `clientSeed` provides protection against a scenario where Registrar and server collude and the `regSeed` is pre-committed against the player.
3. Zero cost — one additional input to the hash, no performance implication.

### Patch to Section 10.3

**Before:**

> 3. `finalSeed` replaces `serverSeed` in the seed chain
> 4. All subsequent randomness derives from `finalSeed`
> 5. Verification: Registrar independently runs `runSpec(regSeed, gameSeed)` and confirms `finalSeed` match

**After:**

> 3. `finalSeed` replaces `serverSeed` in the seed chain: `combinedSeed = SHA-512(finalSeed + ":" + clientSeed + ":" + nonce)`
> 4. The `clientSeed` commit-reveal protocol remains in effect as in Stateless Mode (Section 10.1), providing player contribution to randomness and defense against Registrar-server collusion
> 5. All subsequent randomness derives from `combinedSeed`
> 6. Verification: Registrar independently runs `runSpec(regSeed, gameSeed)` and confirms `finalSeed` match

---

## 6. NOISORE framing and v3 release timing

**Problem:** Move Sync is a significant portion of v3's novelty (both conceptually and through the cryptographic additions in §2). The only listed reference implementation for Move Sync is NOISORE, currently "Planned." Publishing v3 with a major Move Sync specification and no corresponding live implementation risks the same "whitepaper without code" perception that plagues many provably-fair proposals.

**Resolution:** delay v3 release until NOISORE has a working Move Sync implementation under the v3 protocol. Target: before July 2026.

### Scope of NOISORE Move Sync work

1. Player keypair generation (ed25519) in the browser client, using noble-curves or libsodium
2. Signed move construction and transmission
3. Server-side signature verification on each incoming move
4. Server keypair management and publication of public key
5. Signed ack generation and transmission
6. Audit Trail recording in v3 format (§11), including all signed artifacts
7. Public trail publication pipeline (selection of channel: GitHub Gist API, IPFS via pinning service, or own endpoint on Render)
8. Client-side retention of local log (signed_moves + signed_acks)
9. Standalone verifier tool (web or CLI) that accepts Audit Trail + session metadata and produces verification verdict

Estimated effort: 1–2 months of focused work.

### Interim status

Until v3 release:
- `SPEC.md` remains at v2 as currently published
- This `DESIGN_NOTES_v3.md` serves as public signal of intended direction
- Current v2 implementations (Registrar Demo, PADDLA) continue to operate unchanged

---

## 7. Versioning — v3, not v2.1

**Decision:** the next revision is UVS v3.

**Rationale:** adding mandatory cryptographic signing infrastructure to Move Mode is a breaking change for any v2 Move Mode implementation. By semantic-versioning convention, breaking changes require a major bump. Calling this revision "v2.1" would misrepresent the compatibility surface.

The protocol uses integer versions (no minor/patch numbers within the UVS version negotiation). The `uvsVersion` field in session headers will be `3` upon release.

Version negotiation logic (integer sets with `max(intersection)`, per current §3.5) is unchanged.

---

## Summary of spec changes planned for v3

| Section | Change type | Summary |
|---|---|---|
| Header | Revision | Version 2 → Version 3 |
| 3.6 (Audit Trail) | Amend | Add reference to signed entries in Move Mode |
| 5.1 (Move as Unit) | Extend | Add tick-as-unit clarification for multiplayer |
| 5.x (new) | Add | Move Signature Protocol (§2.1–2.3 above) |
| 5.x (new) | Add | Move Acknowledgment Protocol (§2.3 above) |
| 5.4 (Replay) | Soften | Align with tick-unit framing |
| 5.6 (Move Sync) | Rewrite | Reflect signed-move + ack + sequential-processing requirements |
| 6.1 (WASM) | Soften | "useless" → "operationally difficult" + assumption note |
| 9 (Lifecycle) | Amend | Add PUBLISHED state between ACTIVE and REVEALED |
| 10.3 (Protected seed) | Amend | clientSeed retained in combinedSeed formula |
| 11 (Audit Trail format) | Amend | Signed move and ack fields; public trail URL + hash |
| 12 (Errors) | Amend | Add ERR_SIGNATURE_INVALID, ERR_SEQ_GAP, ERR_NO_PUBLIC_LOG, ERR_MISSING_ACK |
| 14 (References) | Update | NOISORE status promoted from Planned to Production on release |
| 16.4 (Philosophy) | Amend | Move-or-Tick scope note |
| 17 (Threat Model) | Extend | Add anti-equivocation, attribution, dispute-evidence items |

---

## Out of scope for v3

Items identified during design but explicitly deferred:

- Formal Dispute Protocol (e.g. arbitrated resolution, slashing, reputation systems). v3 provides the cryptographic evidence layer; higher-level dispute resolution remains out of scope.
- WASM Generator Requirements (formal entropy and diversity bounds for `regSeed` and generator output). Soft statement retained in §6.1; formal spec deferred.
- Additional Game Modes beyond Stateless / Move Batch / Move Sync.
- Blockchain integration beyond the optional sub-layer already in §6.4.

---

*UVS v3 Design Notes · Uncloned Math · April 2026*

*Constantin Razinsky · constr@gmail.com · Telegram: @constrik*
