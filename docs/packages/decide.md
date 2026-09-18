---
title: Decide
description: "@contentrain/decide — small typed decisions (a choice or a score) asked rule first, then Jev, cached, budgeted, circuit-broken and audited; a provider failure never fails the call"
order: 10
slug: decide
---

# Decide

Small typed decisions for migration and governance pipelines. A decision is a
pick from a closed set (a *choice*) or a place on a fixed rubric (a *score*),
never generated text. The chain that answers it:

```
rule  →  cache  →  Jev (typesafe.ai)  →  your LLM (optional)  →  the rule's tentative answer
```

## Why a rule comes first

Most inputs a pipeline decides about are not in doubt. A deterministic rule
settles those for free. Only the band it cannot settle goes to a provider, so
the cost follows the number of undecided inputs, not the number of inputs.
Because Jev answers the same input the same way, a cached answer is never asked
for again. That matters most when the same site passes through a pipeline
again and again.

## Usage

```ts
import { createDecider, JsonlAuditLog, JsonlDecisionCache, MemoryDailyBudget } from '@contentrain/decide'

const decider = createDecider({
  cache: new JsonlDecisionCache('.run/decision-cache.jsonl'),
  audit: new JsonlAuditLog('.run/decisions.jsonl'),
  budget: new MemoryDailyBudget(500),
})

const decisions = await decider.decideMany('punch_item', [
  { label: '(aile: post)', reason: 'en kötü sayfa 43.2 < 80 (5 sayfa ölçüldü)' },
  { label: '(düzenlenemez: post)', reason: 'gövde yuvası yok — içerik veriden gelmiyor' },
], { tenant: 'acme' })

for (const decision of decisions)
  console.log(decision.choice, decision.score, decision.confidence, decision.source, decision.unreviewed ?? false)
```

A decision always carries `kind`, `version`, `key` (the input hash),
`confidence`, `source` (`rule`, `jev`, `llm` or `cache`) and `ms`. It may also
carry `choice`, `score`, `probabilities` and `cost`. A decision that fell back
carries `unreviewed: true` and a `fallback` reason: `no_provider`, `budget`,
`circuit_open`, `timeout`, `error` or `no_answer`.

## Jev and the token

Jev is asked only when `CONTENTRAIN_JEW_API_TOKEN` is set in the environment.
The token is read at the moment of each request. It is never stored, logged or
put in an error message. Requests go to `https://api.typesafe.ai/v1/systemone`
and nowhere else.

## Input shaping

Each kind's shaper decides what may leave the process. Its output is the only
thing sent to a provider and the only thing hashed into the cache key.
`punch_item` drops links and turns URLs, e-mail addresses and paths into
placeholders. `eligibility_band` keeps discovery counts and drops the sampled
records themselves. The audit log keeps hashes, never inputs.

## Kinds

| Kind | Answer | Where the rule stops |
|---|---|---|
| `punch_item` | root-cause class + severity 0–3 for a Migrate run-report punch item: advisory, never a gate | always: the rule suggests a class for phrasings it recognises, and only as the fallback |
| `eligibility_band` | `eligible` · `access_blocked` · `page_only` · `custom_type`, or `needs_human` below 0.5 confidence | the undecided band of Migrate's `judgeEligibility`: posts and custom entries within 2× of each other, or one sampled post |

`needs_human` is derived from low confidence. It is never offered to a
provider as an option.

## Budget, breaker, cache, audit

- **Budget:** `MemoryDailyBudget(n)` caps provider decisions per tenant per UTC
  day. Once the cap is spent, decisions fall back with `fallback: 'budget'`.
  Cache hits and final rule answers cost no budget.
- **Circuit breaker:** one per provider. It opens after 3 consecutive failed
  requests and lets one request through after 60 seconds.
- **Cache:** the key is `sha256(kind, schema version, request shape, canonical shaped input)`.
  The request shape (`requestShapeHash`) covers the model, the batch limits and the whole prompt.
  Only provider answers are cached. `MemoryDecisionCache` and
  `JsonlDecisionCache` are built in; a database store implements
  `DecisionCache`.
- **Audit:** `JsonlAuditLog` writes one line per decision to `decisions.jsonl`.
  Each line holds the input hash, the answer, the confidence, the source, the
  time and the tokens used.

The vendor publishes no price, so `cost` holds token counts. It includes `usd`
only when you pass `pricing`.

## Calibration

A kind is trusted only as far as a live run has measured it against hand
labels. `pnpm calibration:live` asks Jev about the PoC-1 set five times: 272
punch items from 22 run reports, 40 of them labelled by hand. Each request goes
out exactly as the package would send it. The run writes
`calibration/<date>.json`, which records the model, the request-shape hash and
counts only.

| Measure | Gate | `calibration/2026-09-18.json` |
|---|---|---|
| class agreement, every run | ≥ 90% | 34–36/40 |
| severity within one level, every run | ≥ 95% | 36–37/40 |
| same class in all 5 runs | 40/40 | 34/40 |

The gate does not pass today. Until a committed file passes it, `punch_item`
answers are uncalibrated advice. A test holds the shipped request shape to the
shape hash of the latest file, so a changed prompt cannot ship on an old
measurement. `createReplayFetch` replays recorded answers through the full
decider. It is a code-path smoke test, not a measurement.
