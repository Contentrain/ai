---
"contentrain": patch
---

docs: phase R3b — align root README / CLAUDE / AGENTS with current codebase

Repo root guidance files updated so they agree with the per-package
READMEs (phase R2) and the docs site (phase R3):

### README.md
- Architecture diagram: `MCP (16 tools)` → `MCP (17 tools)`.
- Feature bullet: "MCP engine — 16 tools" → "17 tools".
- Packages table: `@contentrain/mcp` row → "17 MCP tools + ...".

### CLAUDE.md
- Monorepo tree `packages/mcp` comment → `17 MCP tools`.
- npm-packages table → `17 MCP tools`.
- Obsolete "Octokit YOK in MCP" decision rewritten: `@octokit/rest`
  and `@gitbeaker/rest` are optional peer dependencies (Phase 5.1 + 8).

### AGENTS.md
- Essentials bullet: "16 MCP tools with mandatory calling protocols"
  → 17.
- Packages table: mcp row → "17 MCP tools — content operations engine".

### RELEASING.md
- No changes — release flow docs stayed accurate through R1-R3.

### CONTRIBUTING.md, CLA.md, CODE_OF_CONDUCT.md
- No changes — standards files, no code-specific content.
