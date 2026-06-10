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

GET /health → { ok, tsas, ahead, ots }
```

Verification of the §5.4 anchor is the spec's reference path: `openssl ts -verify`, and the token's
`genTime` must be `< timeOfRound(R)`.

## Anchor strength

- **×2 RFC-3161 TSAs (default: FreeTSA + DigiCert), stamped concurrently.** The commitment is
  timestamped at *two independent* authorities in different jurisdictions in parallel (latency ≈ the
  slower one). Stamping is fault-tolerant — the draw keeps every token that answers and needs only
  one. The §5.4 gate uses the **earliest** token: one stamp predating R already proves the commitment
  existed before R; the other corroborates the same `commitmentHash`. One TSA lagging, going down, or
  colluding does not break the evidence.
- **OpenTimestamps — free second anchor (opt-in, off by default).** The code path is built in:
  when the `opentimestamps` package is installed, commit also submits `commitmentHash` to the OTS
  calendars and attaches a *pending* proof that matures into a Bitcoin-block trail-immutability anchor
  in ~hours. It is **off by default** so the image builds with zero dependencies and can't fail on
  one; enable it by adding the `npm install` line shown in the `Dockerfile`. It **never blocks** the
  green path — with or without OTS, the draw is 🟢 on the ×2 RFC-3161 tokens (`/health` → `ots:bool`).
- **Persistent pending state.** Commit→reveal state is written to disk (`UVS_STATE_DIR`), so a process
  restart inside the window doesn't drop the session; `serverSeed` stays server-side until reveal.

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
| `UVS_ROUND_AHEAD` | `10` | seconds until the committed future round R (parallel stamping lands well inside this) |
| `UVS_OPENSSL` | `openssl` | openssl binary path |
| `UVS_STATE_DIR` | `os.tmpdir()/uvs3a-pending` | where pending commit→reveal sessions are persisted |
| `UVS_TSA_LOCAL` | — | **dev only:** a local TSA dir (see `paddla-sdk/_3a_test.js`) instead of the public TSAs |

Production TSAs are configured in `3a-server.js` (`TSAS`). Default: **FreeTSA + DigiCert** (×2). Add
more jurisdictions there for additional strength.

## Notes

- **Free plan spins down** after inactivity → first request cold-starts (~30–60 s). Fine for a demo.
- Pending state is disk-persisted, so it survives a process restart *within the same container*; a
  full redeploy still starts clean (acceptable — the commit→reveal window is ~30 s).
- The static client lives at `uvs.uncloned.work/3A` and activates automatically once this is up.
