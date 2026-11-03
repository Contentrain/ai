---
"contentrain": patch
---

`contentrain init` and `contentrain setup` now write the MCP server as `npx -y contentrain@<this CLI's version> serve --stdio` for every agent (Claude Code, Cursor, Windsurf, VS Code, Copilot and Codex). The unpinned `npx contentrain serve --stdio` fetched whatever `latest` was on every agent start. The Astro starter's `.mcp.json` carries the same pin.
