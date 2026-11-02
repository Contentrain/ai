---
"@contentrain/mcp": patch
---

`contentrain_content_save` is now annotated `destructiveHint: true` and `idempotentHint: false`. A singleton save replaces the whole file and an update to an existing collection entry replaces that entry, so a field left out of the input is dropped; clients that gate destructive tools will ask before running it. A collection save without an id adds a new entry on every call, so repeating it is not a no-op. The tool tables now mark `model_save` and `content_save` as destructive.
