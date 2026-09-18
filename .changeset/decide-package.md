---
"@contentrain/decide": minor
---

New package: small typed decisions (a choice or a score), asked of a chain — a deterministic rule first, then Jev (typesafe.ai), then an optional bring-your-own LLM — with the rule's tentative answer, marked `unreviewed`, when no provider answers. Every kind declares a closed set, a schema version and an input shaper whose output is the only thing that leaves the process. Answers are cached by sha256 of kind, version and canonical shaped input (memory and JSONL stores), batched (≤32 items, ≤32k estimated tokens), capped per tenant per day, circuit-broken per provider and audited to `decisions.jsonl`. The Jev token is read only from `CONTENTRAIN_JEW_API_TOKEN`, and requests go only to `https://api.typesafe.ai`. Two kinds ship: `punch_item` (class + severity, with PoC-1's calibrated wording) and `eligibility_band` (the undecided band of Migrate's eligibility verdict, with `needs_human` below 0.5 confidence).
