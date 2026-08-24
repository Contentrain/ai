---
"@contentrain/emitter-astro": patch
---

Fix silent body drop: the generated layout filled marks before splitting at `CHROME_BODY_SLOT`, so the `@@body@@` inside the marker comment was consumed by the `@@…@@` pattern (leaving `<!---->`) and page content was never spliced in (measured: 49.8 vs 97.8). Generated projects now compose via `composeBody` — split at the marker first, then fill each side. The contract constant is unchanged; this was an implementation-order bug.
