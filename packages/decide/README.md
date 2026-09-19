# @contentrain/decide

Small typed decisions for migration and governance pipelines. A decision is a
pick from a closed set (a *choice*) or a place on a fixed rubric (a *score*) —
never generated text. It is asked of a chain:

```
rule  →  cache  →  Jev (typesafe.ai)  →  LLM (Claude Haiku, opt-in)  →  the rule's tentative answer
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

`decideMany(kind, inputs)` batches: items of one kind share a request, and a
kind may group them further (`punch_item` sends one site per request, at most
25 items, as PoC-1 did). Otherwise a request holds at most 32 items and stays
under ~32k tokens by a conservative estimate (`batch` option; a kind's own
limits win). Repeated inputs are asked once unless `fold: false`.
`decide(kind, input)` without a decider uses a
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

The *request shape* is a hash of everything that forms a provider request: the
model, the batch limits, the header, the line format, the questions and their
criteria (`requestShapeHash(kind)`). It is part of every cache key and every
audit record, so a changed prompt never serves an answer given to the old one.

## Kinds

| Kind | Answer | Rule | Provider |
|---|---|---|---|
| `punch_item` | class (`product_defect` · `source_limit` · `cosmetic` · `measurement`) + severity 0–3 | tentative class for run-report phrasings it recognises; never final, because a rule cannot place severity | Jev, with PoC-1's request word for word (site placeholders aside); **advisory** |
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
| Cache — key `sha256(kind, schema version, request shape, canonical shaped input)` | `MemoryDecisionCache`, `JsonlDecisionCache` | implement `DecisionCache` (a database store belongs to the host) |
| Budget — provider decisions per tenant per UTC day | `MemoryDailyBudget` | implement `DecisionBudget` |
| Circuit breaker — per provider, opens after 3 failed requests for 60s | `CircuitBreaker` | pass `breakers` |
| Audit — one record per decision: input hash, answer, confidence, source, time, tokens | `JsonlAuditLog` (`decisions.jsonl`), `MemoryAuditLog` | implement `AuditSink` |

Only provider answers are cached. A rule answer costs nothing to recompute, and
a fallback is not an answer anyone reviewed. A cache hit and a final rule answer
use no budget.

The budget and the breakers cover both providers. One daily cap is shared:
every item in a request that actually goes out spends from it, so an item Jev
failed on and Haiku then answered spends twice. An item behind an open breaker
spends nothing: during a Jev outage only Haiku's requests are charged. Each provider has its own breaker, and
an item behind Jev's open breaker goes on to Haiku.

Both providers report token usage. `cost` carries each decision's share of
its batch's tokens, and `usd` only when you price that provider:
`pricing: { jev: {…}, llm: { inputPerMTok, outputPerMTok } }`. Jev's vendor
publishes no price.

## The LLM link: Claude Haiku

Haiku answers what Jev does not: Jev off, its breaker open, a timeout, an
error. It is opt-in: no model is called unless you wire it.

```ts
import { createAnthropicProvider, createDecider } from '@contentrain/decide'

const decider = createDecider({
  llm: createAnthropicProvider(), // claude-haiku-4-5-20251001, temperature 0
  pricing: { llm: { inputPerMTok: 1, outputPerMTok: 5 } },
})
```

The key is read from `ANTHROPIC_API_KEY` at the moment of each request, on the
same terms as Jev's token: never stored, logged or put in an error message.
Requests go only to `https://api.anthropic.com/v1/messages`. Haiku gets the
same shaped state and questions as Jev, as a prompt, and answers through one
forced tool call, so the answer is a structured record, not parsed prose.
`punch_item` sends the prompt AO-9 measured, word for word; other kinds get a
generic prompt built from their questions.

Its answers are cached under the same key as Jev's: an input answered once, by
either provider, is served from the cache after that, and `model` says which
one answered. A model reports no confidence of its own, so Haiku's answers
carry `confidence: 0` ("not measured"). For `eligibility_band` that means
every Haiku pick goes to `needs_human`, with the pick kept as `proposed`.

A host can wire another model instead: implement `DecisionProvider` with
`name: 'llm'` and pass it as `llm`. The default is `noopLlmProvider`, which is
never available.

## Calibration

**`punch_item` is advisory. Jev does not answer the same request the same way
every time, so these answers are not stable: show them beside the item for a
person to confirm, never as a gate.**

`pnpm calibration:live` sends the PoC-1 set three times to Jev, exactly as
the package sends it: 272 punch items from 22 run reports, 40 of them labelled by
hand. It writes `calibration/<date>.json` with the model Jev reported, the
request-shape hash, and counts only. The gate is set to what Jev measurably
does. The median run must reach class agreement of at least 85% and severity
within one level of at least 90%, and at least 85% of the labelled items must
keep the same class in all three runs.

The latest file, `calibration/2026-09-18.json`, was measured on jev-1.13.0
with request shape `32da2187d1dc37d5`. It passes:

- class agreement: 34 / 35 / 33 of 40 across the runs, median 85.0%. That is exactly
  the threshold.
- severity within one level: 37 / 37 / 37 of 40, median 92.5%.
- stable: 36/40 labelled items and 237/272 of all items.

The request sends placeholders for the site name, its URL and item links. That
keeps site identity out of the request and costs about two to three items of
severity agreement. A test holds the shipped request shape to the file's shape
hash, and requires the file to pass.

`pnpm calibration:live --provider haiku` runs the same set against Haiku
(`--provider both` runs both). It needs `ANTHROPIC_API_KEY`, is held to the
same gate, and writes `calibration/haiku/<date>.json` with Haiku's own request
shape (`anthropicRequestShapeHash`) and its cost at list price. Haiku is the
fallback, so its gate result is recorded for information and blocks nothing.
`calibration/haiku/2026-09-19.json` (claude-haiku-4-5-20251001, LLM request
shape `96aa1feb04caef9a`, $0.33 for the three runs) **fails** the gate:

- class agreement: 37 / 36 / 37 of 40, median 92.5%.
- severity within one level: 33 / 34 / 33 of 40, median 82.5%. This is
  under the 90% gate. Haiku answers severity as a whole level, while Jev
  answers a score between levels.
- stable: 39/40 labelled items and 259/272 of all items.

The PoC-1 set names real sites, so it stays outside this repository.
`CONTENTRAIN_DECIDE_POC1_DIR` points the script and the tests at it.

The tests replay recorded answers through the full decider
(`createReplayFetch`). That checks the code path: shaping, grouping,
batching, reading and scoring. It does not measure the model.
`measurePunchCalibration(labels, decisions)` scores `punch_item` the way
PoC-1 did.

## License

MIT
