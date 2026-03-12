# CLAUDE.md — contentrain-ai

## Project Overview

MIT-licensed monorepo for Contentrain's open-source packages: MCP tools, CLI, TypeScript types, AI rules, and universal query SDK.

**Vision:** "AI-generated content governance infrastructure — Agent üretir, insan onaylar, sistem standardize eder."

## Monorepo Structure

```
contentrain-ai/
├── packages/
│   ├── mcp/          — 13 MCP tools (simple-git + zod + MCP SDK)
│   ├── cli/          — citty + tsdown (init/serve/validate/normalize/connect)
│   ├── types/        — Shared TypeScript types (@contentrain/types)
│   ├── ai-rules/     — AI agent rules & prompts for IDE integration
│   └── sdk/
│       └── js/       — Universal query SDK (@contentrain/query)
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
- `sdk-spec.md` — Universal query SDK, generated client, `#contentrain` imports
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
- **Agent-MCP split** — MCP = deterministic infra, Agent = intelligence. MCP does NOT make content decisions
- **Normalize two phases** — Phase 1: Extraction (content-only), Phase 2: Reuse (source patching). Separate branches, separate reviews
- **Graph-based scan** — scan tool builds import/component graph for project intelligence, reducing token usage dramatically
- **Top 5+ stack support** — Not limited to Vue/Nuxt. Agent handles stack-specific logic, MCP stays framework-agnostic
- **Replacement by agent** — In reuse phase, the agent determines replacement expressions (e.g., `{t('key')}` vs `{{ $t('key') }}`), not MCP
- **SDK = generated client** — Prisma pattern: `contentrain generate` → `.contentrain/client/` with full types. `#contentrain` subpath import (Node.js native). No node_modules generation. Base SDK is framework-agnostic MIT, community builds framework SDKs on top

## npm Packages

| Package | Name | Description |
|---|---|---|
| packages/mcp | @contentrain/mcp | 13 MCP tools |
| packages/cli | contentrain | CLI (npx contentrain) |
| packages/types | @contentrain/types | Shared TypeScript types |
| packages/ai-rules | @contentrain/ai-rules | AI agent rules |
| packages/sdk/js | @contentrain/query | Universal query SDK (generated client) |

## Mandatory Quality Gates

**Every agent MUST pass ALL gates before considering work complete.** No exceptions.

### 1. oxlint (zero errors, zero warnings)
```bash
npx oxlint packages/<package>/src/ packages/<package>/tests/
```
- `sort()` → `toSorted()` (immutable)
- `no-await-in-loop` → use `Promise.all()` for parallel I/O
- No unused imports/variables
- Fix ALL warnings, not just errors

### 2. TypeScript (zero errors)
```bash
cd packages/<package> && npx tsc --noEmit
```
- Strict mode — no `any` escapes without justification
- All types must compile cleanly

### 3. Tests (all pass, meaningful coverage)
```bash
cd packages/<package> && npx vitest run
```
- Every public module MUST have tests
- Runtime classes: test all methods + edge cases (empty data, unknown locale, etc.)
- Generator modules: test output correctness + canonical format
- Integration test: end-to-end flow verification
- Test assertions must be specific (not just `.toBeDefined()`)

### 4. Sprint Documentation
After completing a sprint milestone:
- Update the relevant spec file's roadmap section (check off items, add date)
- If new architectural decisions were made, document them in the spec's decision table
- Update `docs/internal/README.md` if new spec files were created

### 5. Commit Standards
- Conventional commits: `feat(scope)`, `fix(scope)`, `refactor(scope)`
- Scope = package name: `sdk`, `mcp`, `cli`, `types`, `ai-rules`
- Commit message body: what was built, key decisions, test coverage summary

## Commands

```bash
pnpm install
pnpm dev              # All packages in watch mode (pnpm -r --parallel)
pnpm build            # Build all packages (pnpm -r run build)
pnpm test             # Vitest all packages
pnpm lint             # oxlint
lefthook install      # Git hooks
```
