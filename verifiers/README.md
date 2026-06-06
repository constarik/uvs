# UVS — reference verifiers (verifiable allocation)

A UVS draw / gacha / lottery is **one operation: a seeded random permutation** of
the participants, with a published prize pool dealt onto that order.

```
combinedSeed = SHA-256( serverSeed + ":" + drandRandomness )
score(id)    = SHA-256( combinedSeed + ":" + id )
permutation  = participants sorted by score DESC      (ties: id ASC)
allocation   = order[i] receives prizes[i]            (null beyond the pool)
```

- `serverSeed` is committed by the operator **before** the draw.
- `drandRandomness` comes from a public **drand** round (League of Entropy) anyone
  re-fetches — so neither side can grind or pre-pick it.
- Everything after that is deterministic. There is nothing to trust but math.

## Don't trust one implementation — there are four, and they agree

The same algorithm, implemented independently with **no shared code**, all reproduce
`test-vectors.json` **byte-for-byte**:

| File | Language | SHA-256 |
|---|---|---|
| `draw-verify.js` | Node.js | `crypto` (stdlib) |
| `draw_verify.py` | Python 3 | `hashlib` (stdlib) |
| `DrawVerify.java` | Java 17+ | `MessageDigest` (stdlib) |
| `draw_verify.cpp` | C++17 | bundled FIPS-180-4 (no deps) |

Verified identical output:

```
combinedSeed = 32ca5bd0df3efe8ce416e9a9a4a9f797422eed24b1d0f6b455d915364caeced8
winners: #1 TICKET-0002 · #2 TICKET-0012 · #3 TICKET-0001 · #4 TICKET-0005 · #5 TICKET-0006
```

Pick the language you trust, read ~40 lines, run it — or write a fifth and check it
against the vectors. That is what "verifiable" means: not one operator's JavaScript,
but a spec so small four people can reimplement it and get the same answer.

## Run

```
node draw-verify.js record.json            # full winner list
node draw-verify.js record.json TICKET-0001  # one ticket's rank + prize
python draw_verify.py record.json [id]
javac DrawVerify.java && java DrawVerify     # core demo on the canonical record
cl /EHsc /O2 draw_verify.cpp && draw_verify.exe   # MSVC; or g++ -O2 -o dv draw_verify.cpp
```

> `draw-verify.js` and `draw_verify.py` read `record.json` for real use.
> `DrawVerify.java` and `draw_verify.cpp` carry the canonical record in `main` to show
> the core reproduces the vectors — feed your own record by editing `main` (the four
> functions are the verifier; reading the record file is glue).

## Three doors (who verifies, and how)

1. **A participant** enters one number (their ticket / pull id) → their rank + prize.
   No math, no code.
2. **The curious** browse the published list, filter by prize tier, eyeball the rate.
3. **A skeptic** runs one of these verifiers (or writes their own) and re-derives the
   whole allocation from the public `serverSeed` + drand round.

Each takes the door that fits. The point isn't that everyone verifies — it's that
**anyone competent can, in any language, and a lie is therefore catchable.**

## `record.json` format

```json
{
  "serverSeed": "<hex, committed before the draw>",
  "drand": { "round": 29286636, "randomness": "<hex from that drand round>" },
  "participants": ["TICKET-0001", "..."],
  "winners": 5,                 // OR an explicit "prizes": ["LEGENDARY","SEAT",...] pool
  "prizeLabel": "SEAT"
}
```

`SHA-256` of UTF-8 strings; scores compared as lowercase-hex lexicographically; ties
broken by id ascending. `test-vectors.json` is the conformance target for any new
implementation.
