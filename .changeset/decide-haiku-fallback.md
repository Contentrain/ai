---
"@contentrain/decide": minor
---

Claude Haiku as the LLM link of the chain. `createAnthropicProvider()` asks `claude-haiku-4-5-20251001` at temperature 0 for what Jev does not answer (Jev off, its breaker open, a timeout, an error), with the same shaped state and questions, through one forced tool call. `punch_item` sends the prompt AO-9 measured word for word. It is opt-in: the default LLM link is still one that is never available. The key is read only from `ANTHROPIC_API_KEY`, never logged, and requests go only to `https://api.anthropic.com/v1/messages`. Haiku's answers share Jev's cache key, the daily budget and the audit log, and have their own circuit breaker; a model reports no confidence, so they carry `confidence: 0`. `pricing` is now per provider (`{ jev, llm }`). `pnpm calibration:live --provider haiku|both` measures Haiku on the same set, writing `calibration/haiku/<date>.json`.
