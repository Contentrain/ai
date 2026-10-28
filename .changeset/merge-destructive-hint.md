---
"@contentrain/mcp": patch
---

`contentrain_merge` is now annotated `destructiveHint: true`. After merging, it deletes the merged branch locally and on the remote, so MCP clients should ask before running it.
