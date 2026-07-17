---
"@contentrain/mcp": patch
---

fix(mcp): stop DEFAULT_INSTRUCTIONS advertising a universal dry_run

The MCP server instructions told every client to "preview writes with
dry_run:true, then re-run with dry_run:false" — but `dry_run` exists only on
`contentrain_apply`. On every other write tool the unknown key is stripped by
the schema, so an agent following the instructions performed a real write
while believing it had previewed. The instructions now state the actual
safety model: writes land on isolated `cr/*` branches, `content_save`
validates before committing, destructive tools require `confirm:true`, and
`dry_run` is the `contentrain_apply` preview. Still under the 512-character
client-UI budget; no tool behavior changes.
