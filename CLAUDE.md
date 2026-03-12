# CLAUDE.md — contentrain-ai

## Project Overview

MIT-licensed monorepo for Contentrain's open-source packages: MCP tools, CLI, TypeScript types, AI rules, and Nuxt SDK.

**Vision:** "AI-generated content governance infrastructure — Agent üretir, insan onaylar, sistem standardize eder."

## Monorepo Structure

```
contentrain-ai/
├── packages/
│   ├── mcp/          — 13 MCP tools (simple-git + zod + MCP SDK)
│   ├── cli/          — citty + tsdown (init/serve/validate/normalize/connect)
│   ├── types/        — Shared TypeScript types (@contentrain/types)
│   ├── ai-rules/     — AI agent rules & prompts for IDE integration
│   └── sdk/nuxt/     — Nuxt SDK (@contentrain/sdk-nuxt)
├── docs/
│   ├── internal/     — Private specs (gitignored, dev reference only)
│   ├── mcp/          — VitePress docs → mcp.contentrain.io
│   └── ai/           — VitePress docs → ai.contentrain.io
```

## Internal Specs (docs/internal/)

These files contain architectural decisions and are the source of truth during development:
- `mcp-development-spec.md` — 13 MCP tools, Git flow, validation, context.json
- `schema-architecture.md` — 27 types, 4 model kinds, canonical serialization
- `ai-rules-spec.md` — AI agent rules, prompts, context bridge
- `README.md` — Master index, cross-references

**Always read relevant spec before implementing.** Specs are expanded during development as details emerge.

## Tech Stack

- **Runtime:** Node.js 22 LTS
- **Package manager:** pnpm 9+
- **Build:** tsdown (pnpm workspace scripts for orchestration)
- **Lint:** oxlint (NOT ESLint)
- **Format:** oxfmt
- **Test:** Vitest
- **Git hooks:** lefthook
- **MCP validation:** Zod ^3.24 (MCP SDK requirement)

## Key Decisions

- **JSON only** — no YAML
- **Git mandatory** — `contentrain init` auto `git init`
- **Octokit YOK in MCP** — MCP = local-first, platform-agnostic. GitHub API = Studio/CLI only
- **Every write uses worktree + branch** — model_save and content_save alike
- **Collection storage = object-map** — `{ entryId: { fields } }`, sorted by ID
- **Canonical serialization** — deterministic JSON output, sorted keys, 2-space indent, trailing newline
- **context.json** — MCP writes after every write op, Studio/IDE reads
- **Workflow config** — `"auto-merge"` or `"review"` in config.json

## npm Packages

| Package | Name | Description |
|---|---|---|
| packages/mcp | @contentrain/mcp | 13 MCP tools |
| packages/cli | contentrain | CLI (npx contentrain) |
| packages/types | @contentrain/types | Shared TypeScript types |
| packages/ai-rules | @contentrain/ai-rules | AI agent rules |
| packages/sdk/nuxt | @contentrain/sdk-nuxt | Nuxt SDK |

## Commands (planned)

```bash
pnpm install
pnpm dev              # All packages in watch mode (pnpm -r --parallel)
pnpm build            # Build all packages (pnpm -r run build)
pnpm test             # Vitest all packages
pnpm lint             # oxlint
lefthook install      # Git hooks
```
