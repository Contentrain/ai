# @contentrain/decide

## 0.2.1

### Patch Changes

- Updated dependencies [53505cd]
  - @contentrain/types@1.24.0

## 0.2.0

### Minor Changes

- aa0c0bf: Three kinds for Migrate v3's fact pack, each a closed set with a rule first: `field_type` (a varying value's field type among the options the fact pack offers, one Jev request per option set), `region_name` (what a top-level page section is), and `unmapped_element` (which astro-kit component a builder element becomes, or `prose` / `site-specific`). Without `CONTENTRAIN_JEW_API_TOKEN`, the rules answer and in-band decisions come back `unreviewed`, so the same code goes live once the token is set.

### Patch Changes

- Updated dependencies [d87121b]
- Updated dependencies [90b5049]
  - @contentrain/types@1.23.0

## 0.1.6

### Patch Changes

- Updated dependencies [9909194]
- Updated dependencies [250fe5e]
  - @contentrain/types@1.22.0

## 0.1.5

### Patch Changes

- Updated dependencies [10c9b85]
  - @contentrain/types@1.21.0

## 0.1.4

### Patch Changes

- Updated dependencies [fbb651c]
  - @contentrain/types@1.20.0

## 0.1.3

### Patch Changes

- Updated dependencies [93ab71d]
  - @contentrain/types@1.19.1

## 0.1.2

### Patch Changes

- Updated dependencies [c069c67]
  - @contentrain/types@1.19.0

## 0.1.1

### Patch Changes

- Updated dependencies [ae0b3ec]
  - @contentrain/types@1.18.1

## 0.1.0

### Minor Changes

- b970404: Claude Haiku as the LLM link of the chain. `createAnthropicProvider()` asks `claude-haiku-4-5-20251001` at temperature 0 for what Jev does not answer (Jev off, its breaker open, a timeout, an error), with the same shaped state and questions, through one forced tool call. `punch_item` sends the prompt AO-9 measured word for word. It is opt-in: the default LLM link is still one that is never available. The key is read only from `ANTHROPIC_API_KEY`, never logged, and requests go only to `https://api.anthropic.com/v1/messages`. Haiku's answers share Jev's cache key, the daily budget and the audit log, and have their own circuit breaker; a model reports no confidence, so they carry `confidence: 0`. `pricing` is now per provider (`{ jev, llm }`). `pnpm calibration:live --provider haiku|both` measures Haiku on the same set, writing `calibration/haiku/<date>.json`.
- f1dd867: New package: small typed decisions (a choice or a score), asked of a chain — a deterministic rule first, then Jev (typesafe.ai), then an optional bring-your-own LLM — with the rule's tentative answer, marked `unreviewed`, when no provider answers. Every kind declares a closed set, a schema version and an input shaper whose output is the only thing that leaves the process. Answers are cached by sha256 of kind, version, request-shape hash and canonical shaped input (memory and JSONL stores), batched (per kind; ≤32 items and ≤32k estimated tokens by default), capped per tenant per day, circuit-broken per provider and audited to `decisions.jsonl`. The Jev token is read only from `CONTENTRAIN_JEW_API_TOKEN`, and requests go only to `https://api.typesafe.ai`. Two kinds ship: `punch_item` (class + severity, sending PoC-1's request word for word with site placeholders; advisory: Jev's answers are not stable run to run; the live measurement is in `calibration/`) and `eligibility_band` (the undecided band of Migrate's eligibility verdict, with `needs_human` below 0.5 confidence).
