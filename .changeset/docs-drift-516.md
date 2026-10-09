---
"@contentrain/mcp": patch
---

`server.json` (the MCP Registry manifest) is on the package's version again. It said 1.8.1. `pnpm version-packages` now writes it, and `pnpm docs:check` fails when it drifts. The README tool table lists `contentrain_vocabulary_save` / `contentrain_vocabulary_delete`, and the remote-safe subset names them (#516).
