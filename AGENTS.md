# AGENTS.md — contentrain-ai

## Project Overview

MIT-licensed monorepo for Contentrain's open-source packages: MCP tools, CLI, TypeScript types, AI rules, and universal query SDK.

**Vision:** "AI-generated content governance infrastructure — Agent üretir, insan onaylar, sistem standardize eder."

## Monorepo Structure

```
contentrain-ai/
├── packages/
│   ├── mcp/          — 15 MCP tools (simple-git + zod + MCP SDK)
│   ├── cli/          — citty + tsdown (init/serve/validate/normalize/connect)
│   ├── types/        — Shared TypeScript types (@contentrain/types)
│   ├── rules/        — AI agent quality rules & conventions
│   ├── skills/       — AI agent workflow procedures & framework guides
│   └── sdk/
│       └── js/       — Universal query SDK (@contentrain/query)
├── docs/
│   └──              — Reserved for the public VitePress docs site
```

## Documentation Sources

The old `docs/internal/*` spec set is no longer the source of truth.

Use these references instead:
- root [README.md](README.md) for monorepo overview
- package `README.md` files for public package contracts
- [RELEASING.md](RELEASING.md) for versioning and publish flow
- `packages/rules/` and `packages/skills/` for agent behavior guidance

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
- **Every write uses worktree + dedicated contentrain branch + update-ref** — model_save and content_save alike
- **Collection storage = object-map** — `{ entryId: { fields } }`, sorted by ID
- **Canonical serialization** — deterministic JSON output, sorted keys, 2-space indent, trailing newline
- **Dedicated contentrain branch** — content state SSOT, created at init, auto-synced with baseBranch via update-ref. Developer's working tree is never mutated during MCP operations
- **context.json** — committed with content changes (not separately), Studio/IDE reads
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
| packages/mcp | @contentrain/mcp | 15 MCP tools |
| packages/cli | contentrain | CLI (npx contentrain) |
| packages/types | @contentrain/types | Shared TypeScript types |
| packages/rules | @contentrain/rules | AI agent quality rules & conventions |
| packages/skills | @contentrain/skills | AI agent workflow procedures & guides |
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

### 4. Documentation Updates
After changing public behavior:
- Update the affected package `README.md`
- Update root `README.md` if the monorepo contract changed
- Update `RELEASING.md` if release/versioning behavior changed

### 5. Commit Standards
- Conventional commits: `feat(scope)`, `fix(scope)`, `refactor(scope)`
- Scope = package name: `sdk`, `mcp`, `cli`, `types`, `rules`, `skills`
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
