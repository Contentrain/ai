# Contentrain AI

[![npm: @contentrain/mcp](https://img.shields.io/npm/v/%40contentrain%2Fmcp?label=%40contentrain%2Fmcp)](https://www.npmjs.com/package/@contentrain/mcp)
[![npm: contentrain](https://img.shields.io/npm/v/contentrain?label=contentrain)](https://www.npmjs.com/package/contentrain)
[![npm: @contentrain/query](https://img.shields.io/npm/v/%40contentrain%2Fquery?label=%40contentrain%2Fquery)](https://www.npmjs.com/package/@contentrain/query)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-15_skills-8B5CF6)](https://agentskills.io)
[![Docs](https://img.shields.io/badge/docs-ai.contentrain.io-0f172a)](https://ai.contentrain.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Website](https://contentrain.io) · [Docs](https://ai.contentrain.io) · [Discord](https://discord.gg/8XbFKfgeZx) · [Twitter](https://x.com/Contentrain_io) · [LinkedIn](https://www.linkedin.com/company/contentrain)

**Extract, govern, and ship structured content from your codebase.**

Contentrain helps teams turn hardcoded UI text, docs, and structured content into a governed, reviewable content layer. Agents can extract, create, translate, and update content, while Contentrain enforces schema, Git review, and portable file output.

```
Agent extracts or updates content → Contentrain standardizes → Human reviews → Any platform consumes
```

## Try it in 30 seconds

```bash
npx contentrain init        # create .contentrain/ workspace
npx contentrain serve       # open the local review UI
```

That's it. You now have a governed content workspace with models, validation, review branches, and a local UI — no account, no cloud, no proprietary content format.

Start here:

- [See the 2-minute demo](https://ai.contentrain.io/demo)
- [Open the normalize guide](https://ai.contentrain.io/guides/normalize)
- [Read the docs](https://ai.contentrain.io)

## What Contentrain is for

- **Rescuing hardcoded strings** from existing apps and turning them into structured, translatable content
- **Starting new projects with a real content layer** instead of scattering copy across components
- **Serving the same content across web, docs, mobile, and backend systems** from plain JSON and Markdown in Git

## What it is not

- Not an AI writing app
- Not a database-first or dashboard-first CMS replacement for every team
- Not a proprietary content runtime that locks your app to one platform

## What it looks like

**Before:** Hardcoded strings scattered across your codebase — no structure, no translations, no review.

```tsx
export default function Hero() {
  return (
    <section>
      <h1>Welcome to our platform</h1>
      <p>Start your free trial today</p>
      <button>Get Started</button>
    </section>
  )
}
```

**After:** Content lives in `.contentrain/`, typed and structured. Source files use i18n keys.

```tsx
export default function Hero() {
  const t = useTranslations()
  return (
    <section>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.subtitle')}</p>
      <button>{t('hero.cta')}</button>
    </section>
  )
}
```

```json
// .contentrain/content/marketing/hero/en.json
{
  "cta": "Get Started",
  "subtitle": "Start your free trial today",
  "title": "Welcome to our platform"
}
```

The normalize flow extracts strings, creates models, and patches your source files — all through reviewable git branches.

This is the strongest entry point into the product:

**take the content chaos already in your codebase and turn it into a governed, reviewable content layer.**

## How it works

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  AI Agent    │────▶│  MCP (16 tools)  │────▶│ .contentrain/│
│  (decides)   │     │  (enforces)      │     │ (stores)     │
└─────────────┘     └──────────────────┘     └──────┬───────┘
                                                     │
                    ┌──────────────────┐              │
                    │  Review UI / Git │◀─────────────┘
                    │  (human approves)│
                    └──────────────────┘
```

- **Agent** decides what content should exist and where it should come from
- **Contentrain** enforces schemas, validation, canonical serialization, and git workflow
- **Human** reviews through branches, PRs, or the local Serve UI
- **Output** is plain JSON + Markdown that any language or framework can consume

## 4 content kinds

| Kind | What it stores | Storage | Example |
|---|---|---|---|
| **Collection** | Multiple typed entries | JSON object-map | Blog posts, products, team |
| **Singleton** | Single entry per locale | JSON object | Hero section, site config |
| **Document** | Markdown + frontmatter | `.md` files | Docs, articles, changelog |
| **Dictionary** | Flat key-value strings | JSON flat map | i18n translations, UI labels |

27 field types (string, email, url, image, relation, array, object, markdown, ...) with built-in validation.

## Use your content anywhere

Content is plain JSON and Markdown. Any language reads it directly.

For TypeScript projects, generate a typed SDK:

```bash
npx contentrain generate
```

```ts
import { query, singleton, dictionary, document } from '#contentrain'

const hero    = singleton('hero').locale('en').get()
const posts   = query('blog-post').locale('en').include('author').all()
const labels  = dictionary('ui-labels').locale('tr').get('auth.login')
const article = document('docs').locale('en').bySlug('getting-started')
```

Works with Nuxt, Next.js, Astro, SvelteKit, Vue, React, Node, Go, Python, Swift, Flutter, and 20+ stacks.

## Why teams use it

- **Git-native** — every write goes through worktree isolation + review branches
- **Normalize flow** — scan codebase for hardcoded strings → extract → create i18n-ready content → patch source files
- **MCP engine** — 16 tools over stdio or HTTP transport, works with Claude Code, Cursor, Windsurf, or any MCP client
- **Provider-agnostic engine** — the same tool surface runs over a local worktree, GitHub, or GitLab (self-hosted included) with zero tool-code changes. HTTP transport available for remote drivers such as Studio.
- **Canonical serialization** — sorted keys, deterministic output, clean git diffs, conflict-free parallel edits
- **Agent rules & skills** — behavioral policies and step-by-step workflows ship as npm packages
- **Serve UI** — local web dashboard for browsing models, content, validation, and normalize status
- **Framework-agnostic** — MCP doesn't know your framework. Agent + skills handle stack-specific logic

## Agent Skills

This repo ships 15 [Agent Skills](https://agentskills.io) — reusable workflow procedures that any AI coding agent can load on demand.

Install all skills to your agent:

```bash
npx skills add Contentrain/ai/packages/skills
```

Or install a specific skill:

```bash
npx skills add Contentrain/ai/packages/skills --skill contentrain-normalize
```

Skills work with Claude Code, Cursor, Windsurf, GitHub Copilot, OpenAI Codex, Gemini CLI, and 40+ other agents.

See [`AGENTS.md`](AGENTS.md) for the full skill catalog and agent guidance.

## Packages

| Package | npm | Role |
|---|---|---|
| [`@contentrain/mcp`](packages/mcp) | [![npm](https://img.shields.io/npm/v/%40contentrain%2Fmcp)](https://www.npmjs.com/package/@contentrain/mcp) | 16 MCP tools + stdio / HTTP transport + Local / GitHub / GitLab providers |
| [`contentrain`](packages/cli) | [![npm](https://img.shields.io/npm/v/contentrain)](https://www.npmjs.com/package/contentrain) | CLI + Serve UI + MCP stdio entrypoint |
| [`@contentrain/query`](packages/sdk/js) | [![npm](https://img.shields.io/npm/v/%40contentrain%2Fquery)](https://www.npmjs.com/package/@contentrain/query) | Generated TypeScript query SDK |
| [`@contentrain/types`](packages/types) | [![npm](https://img.shields.io/npm/v/%40contentrain%2Ftypes)](https://www.npmjs.com/package/@contentrain/types) | Shared type definitions + constants |
| [`@contentrain/rules`](packages/rules) | [![npm](https://img.shields.io/npm/v/%40contentrain%2Frules)](https://www.npmjs.com/package/@contentrain/rules) | Agent quality rules for IDE integration |
| [`@contentrain/skills`](packages/skills) | [![npm](https://img.shields.io/npm/v/%40contentrain%2Fskills)](https://www.npmjs.com/package/@contentrain/skills) | Workflow procedures + framework guides |

## Starter Templates

Production-ready templates with Contentrain content models, generated SDK client, and framework-specific patterns:

| Template | Framework | Use Case |
|---|---|---|
| [astro-blog](https://github.com/Contentrain/contentrain-starter-astro-blog) | Astro | Blog / editorial |
| [astro-landing](https://github.com/Contentrain/contentrain-starter-astro-landing) | Astro | Landing page |
| [next-commerce](https://github.com/Contentrain/contentrain-starter-next-commerce) | Next.js | E-commerce storytelling |
| [next-multi-surface-saas](https://github.com/Contentrain/contentrain-starter-next-multi-surface-saas) | Next.js | Marketing + app + docs unified |
| [next-saas-dashboard](https://github.com/Contentrain/contentrain-starter-next-saas-dashboard) | Next.js | SaaS dashboard UI copy |
| [next-white-label-portal](https://github.com/Contentrain/contentrain-starter-next-white-label-portal) | Next.js | White-label / multi-tenant |
| [nuxt-admin-console](https://github.com/Contentrain/contentrain-starter-nuxt-admin-console) | Nuxt | Admin console / operations |
| [nuxt-saas](https://github.com/Contentrain/contentrain-starter-nuxt-saas) | Nuxt | SaaS marketing site |
| [sveltekit-editorial](https://github.com/Contentrain/contentrain-starter-sveltekit-editorial) | SvelteKit | Editorial / publication |
| [vitepress-docs](https://github.com/Contentrain/contentrain-starter-vitepress-docs) | VitePress | Documentation site |

Each template is a GitHub template repo — click "Use this template" to start.

## Quick reference

```bash
npx contentrain init         # initialize project
npx contentrain serve        # local review UI (port 3333)
npx contentrain serve --stdio # MCP over stdio for IDE agents
npx contentrain validate     # check content health
npx contentrain generate     # generate typed SDK client
npx contentrain status       # project overview
npx contentrain doctor       # setup health check
npx contentrain studio login   # authenticate with Studio
npx contentrain studio connect # connect repo to Studio project
```

## Documentation

- **[2-Minute Demo](https://ai.contentrain.io/demo)** — the fastest way to understand the product
- **[Getting Started](https://ai.contentrain.io/getting-started)** — install, connect an agent, and run the first workflow
- **[Normalize Guide](https://ai.contentrain.io/guides/normalize)** — the main hardcoded-string rescue flow
- **[Ecosystem Map](https://ai.contentrain.io/ecosystem)** — package-to-product bridges across AI and Studio
- **[Contentrain Studio](https://ai.contentrain.io/studio)** — open-core team operations for Git-native structured content, self-hostable or available as a managed Pro/Enterprise offering
- **[Full Docs](https://ai.contentrain.io)** — guides, package reference, and framework integration

## Development

```bash
pnpm install && pnpm build && pnpm test
```

See [`RELEASING.md`](RELEASING.md) for the versioning and publish workflow.

## Community

- [Discord](https://discord.gg/8XbFKfgeZx) — chat with the team and community
- [GitHub Discussions](https://github.com/Contentrain/ai/discussions) — questions and ideas
- [Twitter / X](https://x.com/Contentrain_io) — product updates and announcements
- [LinkedIn](https://www.linkedin.com/company/contentrain) — company news
- [YouTube](https://www.youtube.com/@contentrain) — tutorials and demos
- [GitHub Issues](https://github.com/Contentrain/ai/issues) — bug reports and feature requests

If Contentrain AI is useful to you, consider giving it a star — it helps others discover the project.

## License

MIT
