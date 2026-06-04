---
"@contentrain/rules": minor
"@contentrain/skills": minor
---

Document the new `contentrain_branch_list` / `contentrain_branch_delete` MCP tools and fix SDK wiring guidance.

- `MCP_TOOLS` / the essential guardrails / the MCP tool reference now include the two new branch tools (19 tools total) and the model/locale/latest selector for `contentrain_merge`.
- Bundler-config snippets for Vite and Nuxt use `import.meta.url` + `fileURLToPath` instead of `__dirname` (which is undefined in ESM `vite.config.ts` / `nuxt.config.ts`), and now cover Nuxt 4's `app/` + `server/` layout.
- The generate skill documents wiring `contentrain generate` into a `prebuild`/`predev` step, since `.contentrain/client/` is git-ignored and must be regenerated on fresh clones / CI.
- Clarified the two generator invocations: `contentrain generate` (CLI) vs `npx contentrain-query generate` (the `@contentrain/query` bin).
