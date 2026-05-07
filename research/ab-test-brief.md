# UVS Visibility A/B Test — Brief

**Author:** Constantin Razinsky / Uncloned Math
**Date:** 2026-05-07
**Status:** Draft for review

---

## 1. Research Question

**Does making UVS verification visible in the player UI change player perception, behavior, or willingness to recommend the game?**

Sub-questions:

1. Do players notice the verification badge?
2. Do players who notice it understand what it means?
3. Does it affect trust, session length, or retention?
4. Does it affect willingness to recommend (NPS-style)?

---

## 2. Hypotheses

**H1.** Players exposed to UVS verification UI report higher perceived fairness than players in the control group.

**H2.** Players exposed to UVS verification UI are more likely to recommend the game (higher NPS).

**H3.** Players exposed to UVS verification UI play longer sessions on average.

**H4 (null / counter-hypothesis).** UVS verification UI has no measurable effect on perception or behavior — players ignore it, do not understand it, or trust the brand regardless.

H4 is a serious possibility. The design must allow it to be supported as a finding, not buried.

---

## 3. Variants

Both variants run on the same game (PADDLA primary; Lucky Mommy 2 as secondary if available before launch).

### Variant A — Control (no UVS visibility)

- Standard game UI
- No mention of verification, math, or provable fairness anywhere in the player-facing flow
- Game is technically still UVS-compliant under the hood; the trail is generated and stored, but not surfaced

### Variant B — Treatment (UVS-visible)

Identical game logic to A. Differences are UI-only:

1. **Persistent badge** in the top bar: "✓ Math-verified" (small, neutral color, non-intrusive)
2. **Post-session card**: after each round, a brief panel:
   > ✓ This session was mathematically verified. No tampering possible.
   > [View proof] ← collapsible, opens audit trail page
3. **Menu item** "Why is this honest?" — links to a one-page explanation in plain language (no JSON, no hashes by default; "show technical details" hidden behind a toggle)
4. **Footer attribution**: "Verified by Registrar Demo" with link

No other UI changes. No copy changes elsewhere. Same colors, same buttons, same game flow.

### Randomization

- Players assigned to A or B at session start, weighted 50/50
- Assignment is sticky for the duration of the session
- Cross-session assignment for retention measurement requires persistent ID — handled via signed magic-link or simple email handle

### Sample size

- **Pilot:** 60–100 players total (30–50 per arm). Detects effect sizes d ≥ 0.5 with power 0.8 on continuous outcomes.
- **Full study:** 400+ players (200 per arm). Detects effects d ≥ 0.25, sufficient for retention and NPS comparisons.

Pilot first. Decide on full study after pilot results.

---

## 4. Metrics

### Primary

| Metric | Type | Source | Test |
|---|---|---|---|
| Perceived fairness rating (1–7) | Continuous | Post-session survey | Mann–Whitney U |
| Recommend likelihood (NPS, 0–10) | Continuous | Post-session survey | Mann–Whitney U |
| Session duration (seconds) | Continuous | Server logs | t-test or Mann–Whitney |

### Secondary

| Metric | Type | Source | Test |
|---|---|---|---|
| Badge noticed (yes / no / I don't remember) | Categorical | Post-session survey, B only | Descriptive |
| Badge understood (free-text) | Qualitative | Post-session survey, B only | Thematic coding |
| Verify-link click-through rate | Rate | Frontend event tracking, B only | Descriptive |
| Day-1 return rate | Categorical | Backend, requires persistent ID | Chi-square |
| Day-7 return rate | Categorical | Backend, requires persistent ID | Chi-square |

### Open-ended (qualitative)

- "What did you think about during the game?" (both groups)
- "What would convince you a game is honest?" (both groups; asked **before** revealing the variant)
- "What did the verification badge mean to you?" (B only)

These are coded thematically, not statistically tested. Goal: surface unexpected interpretations and language patterns.

---

## 5. Decision Outcomes

The test answers three different questions. Decision rules for each:

### Q1: Should UVS verification be visible by default in shipped games?

| Pilot result | Decision |
|---|---|
| B significantly higher fairness perception (p < 0.05) AND higher NPS | **Ship visible.** UVS visibility is a marketing asset, integrate into all reference games. |
| B higher fairness perception, NPS unchanged | **Ship visible, but reposition.** Players value it but don't translate to recommendation — language needs work. |
| No significant differences | **Ship invisible.** UVS works as backend assurance; player-facing UI does not move the needle. Continue protocol development; reposition marketing toward operators / regulators / journalists rather than end-players. |
| B *lower* on any metric | **Investigate.** Possible explanations: badge increases anxiety ("why does this game need to prove honesty? maybe others are dishonest?"), or visual clutter degrades experience. Iterate on design before next test. |

### Q2: What language resonates?

Open-ended responses to "What would convince you a game is honest?" form a vocabulary list. The terms players use spontaneously become candidates for B-version copy in subsequent iterations. Goal: replace inventor's language ("verifiable", "deterministic", "provably fair") with player's language ("transparent", "no tricks", "I can check it").

### Q3: Is provable fairness a niche or mass concern?

If <20% of control-group players (variant A) mention any notion of mathematical or technical verification when asked "what would convince you a game is honest?" — provable fairness is a **niche concern**. Marketing and product strategy should target the niche, not pursue mainstream adoption.

If 20–50% mention something resembling verification, audit, transparency, or third-party check — there is a **latent demand** that UVS can serve. Mainstream adoption is plausible with the right framing.

If >50% mention it — there is **active demand**, and current iGaming UX is failing players who already want this. UVS should be commercially aggressive.

---

## 6. Survey Instrument (planned for separate document)

To be drafted as `survey-instrument.md`. Outline:

- Pre-game (3 questions): age bracket, gambling experience level, prior beliefs about fairness in online games
- Sample sessions (5–10 minutes of actual gameplay)
- Post-game block 1 (both groups, 5 questions): perceived fairness, NPS, session enjoyment, "what would convince you", "did anything stand out"
- Post-game block 2 (B only, 4 questions): noticed badge?, what did it mean?, did it affect trust?, did you click verify?
- Demographics (3 questions): country, primary language, primary device

Total time: 12–15 minutes.

---

## 7. Recruitment

### Target audience

- People who play **any** form of online game with random outcomes (slots, crash games, sports betting, fantasy, P2P card games, lotteries)
- Mix of casual (≤1 hr/week) and engaged (≥5 hr/week)
- Geographic spread: Eastern Europe, Western Europe, North America preferred for diversity

### Channels (pilot, ranked by efficiency)

1. Telegram channels in gaming/crypto/iGaming verticals — fast, cheap, but homogeneous audience
2. Reddit: r/gambling, r/RealMoneyGaming, r/onlinegambling, r/crypto — moderation risk, but targeted
3. LinkedIn personal post — fast, but biased (your professional network already understands UVS)
4. Prolific.co — paid platform, $8–12 per respondent, clean demographics, no recruitment work required
5. Word of mouth among non-iGaming friends — for control group reality check; small but high signal

### Compensation

$5–10 per completed survey (15 minutes). Paid via PayPal, USDT, or Wise. Higher rate ($15) for Prolific to match platform expectations.

### Exclusion criteria

- iGaming professionals (skews data — they recognize UVS terminology)
- Cryptocurrency enthusiasts who already use provably fair casinos (already converted; no signal)

---

## 8. Bias Mitigation

The author runs the study, designs the variants, and analyzes the data. This creates risk of confirmation bias toward H1–H3.

Mitigations:

1. **Pre-register hypotheses and decision rules** in this document before data collection. Final decisions follow the rules even if results disappoint.
2. **Independent review** of the survey instrument before launch. One reviewer outside iGaming and outside crypto/Web3.
3. **Pre-specify analysis plan** (which tests, which thresholds) before opening any data.
4. **Blind coding of qualitative responses** — open-text answers analyzed without knowing which arm produced them.
5. **Report H4 (null) outcome with the same prominence as H1–H3.** A finding that "UVS visibility doesn't matter" is a real finding, not a failure.

---

## 9. Timeline

| Phase | Duration | Output |
|---|---|---|
| Brief finalization (this doc) | 2 days | Approved brief |
| Survey instrument design | 3 days | `survey-instrument.md` |
| Independent review of survey | 3 days | Edits |
| B-variant UI implementation in PADDLA | 5–7 days | Variants A and B live |
| Pilot recruitment + data collection | 7–10 days | 60–100 responses |
| Analysis | 3–5 days | Pilot report |
| Decision: ship / iterate / full study | — | Recorded in this brief |

Total pilot duration: ~4 weeks from approval to decision.

---

## 10. Out of Scope

- A/B testing of specific copy variants ("Math, not trust" vs "Provably fair" vs "No tricks") — downstream once the binary visible/invisible question is answered
- Long-term retention beyond Day 7 — requires sustained traffic that the pilot does not provide
- Effect on operator metrics (revenue, GGR, churn) — UVS is not deployed in operator settings yet
- Cross-cultural comparison — pilot is too small to support country-level analysis

---

## 11. Open Questions for Author

Before launch, decide:

1. **Persistent ID strategy.** Anonymous one-shot survey is simplest but loses retention metrics. Email-based ID allows Day-1 / Day-7 measurement but raises GDPR considerations.
2. **Game choice.** PADDLA is ready. Lucky Mommy 2 may be more representative of typical player base (casino slot vs skill arcade). Pilot on PADDLA is faster; full study could include both.
3. **Localization.** Survey in English only, or include Russian/Ukrainian for fuller Eastern European response? More languages = more respondents but more variance.

---

*Draft v1 · 2026-05-07 · Uncloned Math*
