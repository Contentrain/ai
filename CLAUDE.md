# CLAUDE.md — contentrain-ai

## Project Overview

MIT-licensed monorepo for Contentrain's open-source packages: MCP tools, CLI, TypeScript types, AI rules, and universal query SDK.

**Vision:** "AI-generated content governance infrastructure"

## Monorepo Structure

```
contentrain-ai/
├── packages/
│   ├── mcp/          — 17 MCP tools, stdio + HTTP transports, Local / GitHub / GitLab providers (simple-git + zod + MCP SDK)
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

The old `docs/internal/*` spec set is no longer active.

Use these references instead:
- root [README.md](README.md)
- package `README.md` files
- [RELEASING.md](RELEASING.md)
- `packages/rules/` and `packages/skills/`

## Contentrain Rules & Skills (MANDATORY)

When working with Contentrain content operations (models, content, normalize, validate), you MUST follow the rules and skills in this repo:

### Essential Rules (always-loaded, ~86 lines)
- `packages/rules/essential/contentrain-essentials.md` — compact guardrails for every conversation

### Skills (Agent Skills standard, on-demand)
- `packages/skills/skills/contentrain/` — core architecture, MCP tools, content formats
- `packages/skills/skills/contentrain-normalize/` — two-phase normalize (extract + reuse)
- `packages/skills/skills/contentrain-quality/` — content quality, SEO, accessibility, media
- `packages/skills/skills/contentrain-sdk/` — @contentrain/query SDK usage
- `packages/skills/skills/contentrain-content/` — content CRUD operations
- `packages/skills/skills/contentrain-model/` — model creation/update
- `packages/skills/skills/contentrain-generate/` — SDK client generation
- See `packages/skills/skills/` for all 15 skills

### Critical rules to always follow:
1. **Always call `contentrain_describe_format` before creating models or content** — understand storage formats
2. **Dictionary = flat key-value, all strings, no fields, no id/slug** — keys are semantic addresses
3. **Collection = object-map by entry ID, typed fields** — IDs are auto-generated hex
4. **Always dry_run:true first, review, then dry_run:false** — never skip preview
5. **MCP is deterministic infra, agent is intelligence** — MCP does NOT make content decisions
6. **Normalize branches always use review workflow** — never auto-merge

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
- **Optional remote providers** — MCP is local-first by default (stdio + LocalProvider). `@octokit/rest` (GitHubProvider) and `@gitbeaker/rest` (GitLabProvider) ship as **optional peer dependencies** — installed only when a remote provider is used
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
| packages/mcp | @contentrain/mcp | 17 MCP tools, stdio + HTTP transports, Local / GitHub / GitLab providers |
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
