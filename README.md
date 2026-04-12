# UVS — Uncloned Verification Standard

Open protocol for verifiable games. Mathematically provable fairness without regulators.

📄 **[Read the full specification → SPEC.md](./SPEC.md)**

---

**Version:** 1.0  
**Status:** Final  
**Published:** April 2026  
**Author:** [Uncloned Math](https://uncloned.work)  
**Design reference:** [Registrar Protocol](https://registrar.uncloned.work)

---

## What is UVS?

UVS defines how randomness is generated, how state is recorded, how simulation is reproduced, and how fairness is verified — without trusting the operator.

It is not a library, not a framework, and not an engine. It is a protocol.

## Key properties

- **Deterministic** — same seed + params always produces the same result
- **Verifiable** — any player or auditor can reproduce any session independently
- **Unbounded** — no upper limit on simulation length; determinism preserved across billions of steps
- **Parametric** — caller-defined parameters are part of the verifiable input
- **Self-contained** — no external regulators required for fairness guarantees

## Cryptographic primitives

| Primitive | Usage |
|---|---|
| SHA-256 | serverSeedHash, stateHash, sessionId |
| SHA-512 | combinedSeed derivation |
| ChaCha20 | PRNG (RFC 8439) |
| Canonical JSON | deterministic state serialization |

## Quick start

```js
// combinedSeed derivation
combinedSeed = SHA-512(serverSeed + ":" + clientSeed + ":" + nonce)

// ChaCha20 key and nonce
key    = combinedSeed[0..31]   // 32 bytes
nonce  = combinedSeed[32..43]  // 12 bytes

// Each step
const rng    = new UVS_PRNG(combinedSeed)
const output = simulate(state, input, rng, params)
auditTrail.push({ step, params, input, output, stateHash, rngCalls: rng.consumed() })
```

Full example with session header, hash mismatch handling, and `canonicalJSON()` → [SPEC.md § 10](./SPEC.md#10-minimal-example)

## Test vectors

Verify your implementation against [section 11](./SPEC.md#11-test-vectors):

```
serverSeed    : deadbeefcafebabe0102030405060708090a0b0c0d0e0f101112131415161718
clientSeed    : player_seed_42
nonce         : 1

serverSeedHash: 0dc3c92d4a8b8c6cab67eee53e8177f679e5efa47cce6eb741255466f8dfcf3e
sessionId     : b2332394bde343fb52bd8ff036c4558a29b480733c0d8973f2c78bfa8966fc35
rngCalls[0]   : 618181213 (0x24d8b25d)
stateHash     : 5e1fc7e7a541ecb9c8ed55c21950f40d5b7d06f79d8b9e4dcede9636520c3ce6
```

## License

The UVS specification is published under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Implementations may use any license.
