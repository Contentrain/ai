---
'@contentrain/query': minor
'contentrain': patch
---

Public builds can hold back entries that carry no workflow status. `requireStatus: true` on `generate()` and `contentrainLoader()`, or `--require-status` on `contentrain-query generate` and `contentrain generate`, excludes an entry with no meta record or one without `status`. Without it such entries stay visible as legacy content. It implies `publishedOnly`, and published entries still honour their `publish_at` / `expire_at` window. It matches the emitter's `requireStatus`, for projects where every entry is expected to carry a status, such as a WordPress import.

A dictionary is now gated as one file, like a singleton or document, because its meta is a single record: a draft dictionary no longer ships under `publishedOnly`, and a published one keeps every key under `requireStatus`.
