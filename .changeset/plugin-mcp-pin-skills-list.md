---
"@contentrain/claude-plugin": patch
"contentrain": patch
---

The Claude Code plugin starts `@contentrain/mcp@^3` instead of the stale 2.3.0 pin (24 tools, while the plugin's skill described 27). `pnpm plugin:build` now writes `plugins/contentrain/.mcp.json` from the current major in `packages/mcp/package.json`, so CI's stale-payload check catches the next major.

`contentrain skills` installs and `--list`s every skill the `@contentrain/skills` package ships, read from its `skills/` directory, rather than a hand-kept list of 15 that left out `contentrain-migrate-wordpress`.
