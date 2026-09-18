# @contentrain/decide

Small typed decisions for migration and governance pipelines. A decision is a
pick from a closed set (a *choice*) or a place on a fixed rubric (a *score*) —
never generated text. It is asked of a chain:

```
rule  →  cache  →  Jev (typesafe.ai)  →  your LLM (optional)  →  the rule's tentative answer
```

A deterministic rule answers first. Only what the rule leaves undecided goes to
a provider, each answer is cached by its shaped input, spending is capped per
tenant per day, a circuit breaker stops calling a failing provider, and every
decision lands in an audit log. No provider failure ever fails a call: the
decision falls back to the rule's answer, marked `unreviewed`.

```bash
pnpm add @contentrain/decide
```

## Usage

```ts
import { createDecider, JsonlAuditLog, JsonlDecisionCache, MemoryDailyBudget } from '@contentrain/decide'

const decider = createDecider({
  cache: new JsonlDecisionCache('.run/decision-cache.jsonl'),
  audit: new JsonlAuditLog('.run/decisions.jsonl'),
  budget: new MemoryDailyBudget(500),
})

const decision = await decider.decide('punch_item', {
  label: '(aile: post)',
  reason: 'en kötü sayfa 43.2 < 80 (5 sayfa ölçüldü)',
})

decision.choice      // 'measurement'
decision.score       // 2.03 — severity on the kind's 0–3 rubric
decision.confidence  // 0–1
decision.source      // 'rule' | 'jev' | 'llm' | 'cache'
decision.unreviewed  // true when no provider answered
```

`decideMany(kind, inputs)` batches: items of one kind share a request, at most
32 a batch and under ~32k tokens by a conservative estimate (`batch` option).
Duplicate inputs are asked once. `decide(kind, input)` without a decider uses a
default one: built-in kinds, Jev when the token is set, an in-memory cache.

## Jev

Jev is asked only when `CONTENTRAIN_JEW_API_TOKEN` is set in the environment.
The token is read at the moment of each request and goes straight into the
`Authorization` header; it is never stored on an object, logged, or put in an
error message. Requests go to one fixed endpoint,
`https://api.typesafe.ai/v1/systemone` — there is no base-URL option. Without a
token the chain answers from rules, and in-band decisions come back
`unreviewed`.

## Input shaping

Every kind has a shaper, and the shaped input is the only thing that leaves the
process or reaches the cache key. It keeps what the decision needs and drops the
rest: `punch_item` drops the page link and turns URLs, e-mail addresses and
paths in the text into placeholders; `eligibility_band` keeps discovery counts
and drops the sampled records themselves. The audit log keeps the input's hash,
never the input.

## Kinds

| Kind | Answer | Rule | Provider |
|---|---|---|---|
| `punch_item` | class (`product_defect` · `source_limit` · `cosmetic` · `measurement`) + severity 0–3 | tentative class for run-report phrasings it recognises; never final, because a rule cannot place severity | Jev, with PoC-1's calibrated wording |
| `eligibility_band` | `eligible` · `access_blocked` · `page_only` · `custom_type`, or `needs_human` | mirrors Migrate's `judgeEligibility`; final outside the undecided band | Jev, in the band only |

The `eligibility_band` band is two cases: posts and custom-type entries within
a factor of two of each other, and a site with exactly one sampled post. A Jev
answer under 0.5 confidence becomes `needs_human`, with Jev's pick kept as
`proposed`. `needs_human` is derived only — it is never offered to Jev.

Pass `options.rule` to use your own rule (Migrate passes its verdict function),
or `null` to skip rules.

## Cache, budget, breaker, audit

| Piece | Built in | Bring your own |
|---|---|---|
| Cache — key `sha256(kind, schema version, canonical shaped input)` | `MemoryDecisionCache`, `JsonlDecisionCache` | implement `DecisionCache` (a database store belongs to the host) |
| Budget — provider decisions per tenant per UTC day | `MemoryDailyBudget` | implement `DecisionBudget` |
| Circuit breaker — per provider, opens after 3 failed requests for 60s | `CircuitBreaker` | pass `breakers` |
| Audit — one record per decision: input hash, answer, confidence, source, time, tokens | `JsonlAuditLog` (`decisions.jsonl`), `MemoryAuditLog` | implement `AuditSink` |

Only provider answers are cached. A rule answer costs nothing to recompute, and
a fallback is not an answer anyone reviewed. A cache hit and a final rule answer
use no budget.

Jev reports token usage; the vendor publishes no price. `cost` carries each
decision's share of its batch's tokens, and `usd` only when you pass
`pricing: { inputPerMTok, outputPerMTok }`.

## Your own LLM

The last provider in the chain is yours: implement `DecisionProvider` with
`name: 'llm'` and pass it as `llm`. The package ships only `noopLlmProvider`,
which is never available. It does not call any model itself.

## Calibration

A kind is trusted only as far as it has been measured against hand labels.
`createReplayFetch(kind, recordedCases)` answers Jev requests from recorded
answers, so a labelled set runs offline through the same shaping, batching and
reading code as a live run. `measurePunchCalibration(labels, decisions)` scores
`punch_item` the way PoC-1 did.

The package tests run three tiers:

- **Synthetic** (always): an invented set in `src/fixtures/`. It checks the
  harness, and says nothing about the model.
- **PoC-1, recorded answers** (when `CONTENTRAIN_DECIDE_POC1_DIR` points to the
  experiment directory): 40 hand-labelled punch items from 22 run reports.
  Gate: class ≥ 90%, severity within one level ≥ 95%, the same class in 5 of
  5 runs. Measured today: 37/40 and 39/40. The set names real sites, so it
  stays outside this repository.
- **PoC-1, live** (when the directory is set and the token is too): the same
  gate against Jev as it is now, in ten requests. CI has no token and skips it.

## License

MIT
