# UVS 3A — anchored-draw server

A **standalone** uvLottery server that issues genuinely **🟢 outcome-bound** draws: it stamps each
draw's `commitmentHash` at an **RFC 3161 Time-Stamping Authority** *before* the future drand round
publishes, proving the commitment preceded the round (uvLs §5.4 — defeats commitment-backdating).

It runs in its **own contour** — it does not touch the live registrar, PADDLA, or `/draw`. The live
`/draw` demo stays an honest **🟡** (outcome-bound, but its commitment time is self-asserted); this
service is where the real **🟢** lives.

## Flow

```
POST /commit { participants, rules, model }
  → serverSeed, commitment = SHA-256(serverSeed), a FUTURE drand round R,
    commitmentHash = SHA-256(canonical commitment record),
    RFC-3161 token(s) over commitmentHash from the TSA(s),
    → { sessionId, commitment, round R, roundTime, commitmentAnchor }

POST /reveal { sessionId }        (after roundTime)
  → fetch randomness(R), run the draw, → the 🟢 record (result + commitmentAnchor)

GET /health → { ok, tsas, ahead }
```

Verification of the §5.4 anchor is the spec's reference path: `openssl ts -verify`, and the token's
`genTime` must be `< timeOfRound(R)`.

## Deploy on Render

**Blueprint (one click):** Render → **New → Blueprint** → connect `github.com/constarik/uvs` → **Apply**.
The `render.yaml` at the repo root provisions this service (`uvs-3a`, Docker, root dir `3a-server`).

**Manual:** Render → **New → Web Service** → connect the repo → **Root Directory:** `3a-server` →
**Runtime:** Docker → **Create**. URL will be `https://uvs-3a.onrender.com`.

The Docker base installs `openssl` (with `ts`), which the native runtime may lack — so always deploy
**via Docker**, not the native Node runtime.

## Configuration (env)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | (Render-injected) | listen port |
| `UVS_ROUND_AHEAD` | `9` | seconds until the committed future round R |
| `UVS_OPENSSL` | `openssl` | openssl binary path |
| `UVS_TSA_LOCAL` | — | **dev only:** a local TSA dir (see `paddla-sdk/_3a_test.js`) instead of FreeTSA |

Production TSAs are configured in `3a-server.js` (`TSAS`). Default: FreeTSA. For full §5.4 strength,
add a **second TSA in another jurisdiction** (×2) so backdating-by-collusion is implausible.

## Notes

- **Free plan spins down** after inactivity → first request cold-starts (~30–60 s). Fine for a demo.
- In-memory pending state: a restart between `/commit` and `/reveal` loses that session (use storage
  for production load).
- The static client lives at `uvs.uncloned.work/3A` and activates automatically once this is up.
