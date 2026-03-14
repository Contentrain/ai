# Contentrain Studio — Plans & Specifications

> Master index for all planning and specification documents.

---

## Document Map

| Document | Domain | Description | Status |
|---|---|---|---|
| [product-strategy.md](./product-strategy.md) | Business | Vizyon, hedef kitle, gelir modeli, rekabet, AGPL | v1.0 |
| [schema-architecture.md](./schema-architecture.md) | Schema | Type system, 27 types, 4 model kinds, canonical serialization | v2.1 |
| [mcp-development-spec.md](./mcp-development-spec.md) | MCP | 13 MCP tools, Git operations, validation | v1.3 |
| [studio-spec.md](./studio-spec.md) | Studio | Tek Nuxt 4 app: UI + API + DB + CDN (chat-led, review-backed) | v1.0 |
| [ai-rules-spec.md](./ai-rules-spec.md) | AI Rules | contentrain-ai `packages/ai-rules/` spec, prompts, context bridge | v1.0 |
| [sdk-spec.md](./sdk-spec.md) | SDK | Universal query SDK, generated client, `#contentrain` imports | v1.0 |
| [development-guide.md](./development-guide.md) | Planning | Phase-based implementation plan, testing, CI/CD | v2.0 |
| [cli-serve-spec.md](./cli-serve-spec.md) | CLI | Local serve UI: Vue + H3 + MCP bridge, content viewer & reviewer | v1.0 |
| [scanner-v2-spec.md](./scanner-v2-spec.md) | MCP | AST-based scanner refactor: replace regex with framework-specific parsers | v1.0 |

---

## Repo Relationships

```
┌──────────────────────────────────────────────┐
│           contentrain-ai  (MIT)               │
│  ┌────────────┐ ┌──────┐ ┌───────────────┐   │
│  │ packages/  │ │ pkg/ │ │ packages/     │   │
│  │ mcp        │ │ cli  │ │ types         │   │
│  │ (13 tools) │ │      │ │ ai-rules      │   │
│  └──────┬─────┘ └──────┘ │ sdk/js (query)│   │
│         │                 └───────────────┘   │
│  docs/mcp/ → mcp.contentrain.io              │
│  docs/ai/  → ai.contentrain.io               │
└──────┬───────────────────────────────────────┘
       │  npm: @contentrain/mcp, @contentrain/types, @contentrain/query
       ▼
┌──────────────────────────────────────────────┐
│     contentrain-studio  (AGPL-3.0)           │
│  Nuxt 4 app (app/ + server/ + content/)      │
│  Chat-first UI + Nitro API + CDN             │
│  studio.contentrain.io                        │
│  plans/ lives here                            │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│     contentrain  (existing, unchanged)        │
│  Old CMS — contentrain.io                     │
│  Will be archived when Studio is stable       │
└──────────────────────────────────────────────┘
```

### Subdomain Strategy

| Subdomain | Repo | Platform |
|---|---|---|
| `contentrain.io` | contentrain (old app) | Unchanged |
| `studio.contentrain.io` | contentrain-studio | Netlify |
| `mcp.contentrain.io` | contentrain-ai `docs/mcp/` | Netlify / CF Pages |
| `ai.contentrain.io` | contentrain-ai `docs/ai/` | Netlify / CF Pages |

### Repo Summary

| Repo | License | Status | Description |
|---|---|---|---|
| **contentrain-ai** | MIT | Active — monorepo | packages/mcp, packages/cli, packages/types, packages/ai-rules, packages/sdk/js, docs/ |
| **contentrain-studio** | AGPL-3.0 | Active — Nuxt 4 app | Studio UI + Nitro API + CDN. Depends on `@contentrain/mcp` and `@contentrain/types` via npm |
| **contentrain** | — | Running, will archive later | Old CMS app (Vue 3 + NestJS). contentrain.io domain stays |

> **Note:** `plans/` directory lives in the `contentrain-studio` repo.

---

## Key Decisions

- **JSON only** — no YAML, tüm platformlarda native
- **Git mandatory** — "Git yok" modu silindi, `contentrain init` auto `git init`
- **Chat-first UI** — not form-based CMS; birincil input = chat, birincil output = diff/review
- **BYOA** (Bring Your Own Agent) — AI billing = NEVER, kullanıcı kendi API key'i
- **AGPL open core** — self-host ücretsiz, hosted = freemium
- **Collection object-map storage** — key=entryId, flat constraints
- **Canonical serialization** — deterministic JSON output, Git-friendly diffs
- **context.json for IDE↔Studio sync** — MCP writes, Studio reads
- **Roles:** owner (implicit) + admin + editor + reviewer

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| App | Nuxt 4 (SSR + Nitro 2 API routes) |
| UI | lui-vue + Tailwind CSS v4 + Pinia |
| DB | Drizzle ORM + better-sqlite3 (default) / PostgreSQL (optional) |
| CDN | Cloudflare R2 (@aws-sdk/client-s3) |
| Git | Octokit (@octokit/rest + @octokit/auth-app) |
| Lint | oxlint (Rust) |
| Format | oxfmt (Rust) |
| Validation | Valibot v1+ (Studio) / Zod ^3.24 (MCP — SDK requirement) |
| Git hooks | lefthook (Go, parallel) |
| Test | Vitest + @nuxt/test-utils |
| CLI | Node.js + citty + tsdown (in contentrain-ai `packages/cli/`) |
| Deploy | Netlify (hosted) / Docker (self-host) |
| Docs (MCP/AI) | VitePress (in contentrain-ai `docs/`) |
| Docs (Studio) | Nuxt Content (in contentrain-studio `content/`) |

---

## Archive

Eski/superseded dokümanlar `archive/` dizininde:
- studio-spec.md (v0.5) — Replaced by studio-spec.md v1.0
- studio-ui-spec.md (v1.0) — Merged into studio-spec.md v1.0
- studio-backend-spec.md (v1.0) — Merged into studio-spec.md v1.0
- studio-mvp-matrix.md (v0.5) — Consolidated into product-strategy.md
- studio-competitive-analysis.md — Consolidated into product-strategy.md
- studio-development-guide.md (v5) — Replaced by development-guide.md v2.0
- STRATEJI-RAPORU.md — Consolidated into product-strategy.md
- 01-review-refactor.md, 02-new-architecture.md, 03-ecosystem.md — Early drafts
