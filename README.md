# Contentrain AI

AI-generated content governance infrastructure.

Contentrain is for teams that want to use AI agents to produce content without giving up structure, reviewability, or runtime safety.

Instead of treating content generation as a loose prompt workflow, Contentrain turns it into a governed system:

- the agent decides what content should exist
- MCP and CLI enforce deterministic writes, validation, and git workflow
- humans review the result
- the generated SDK consumes content safely inside the app

In one sentence:

**Agent produces. Human approves. System standardizes.**

## ✨ Why This Exists

AI is very good at producing copy, labels, docs, translations, and structured content.

AI is not good at protecting your repository from drift.

Without a governance layer, AI-assisted content work usually turns into one or more of these problems:

- hardcoded strings spread through source files
- schema drift between teams and environments
- inconsistent locales and missing translations
- direct edits with no review branch or audit trail
- content that is easy to generate but hard to consume safely at runtime
- IDE agents that each invent their own workflow

Contentrain exists to solve that gap.

It is not just "AI for content".

It is a system for **AI-assisted content operations**:

- content modeling
- content storage
- validation
- normalization
- review workflow
- runtime consumption
- agent guidance

## 🧩 What Contentrain Is

Contentrain is a monorepo containing the open-source building blocks of the ecosystem:

| Package | Name | Role |
| --- | --- | --- |
| `packages/mcp` | `@contentrain/mcp` | local-first MCP server and deterministic content operations |
| `packages/cli` | `contentrain` | CLI, local review UI, stdio MCP entrypoint |
| `packages/types` | `@contentrain/types` | shared domain contracts |
| `packages/rules` | `@contentrain/rules` | agent policy, quality rules, IDE bundles |
| `packages/skills` | `@contentrain/skills` | workflow procedures and framework guides |
| `packages/sdk/js` | `@contentrain/query` | generated query SDK and runtime |

Together, these packages form a single workflow:

1. detect or model content
2. write it into a governed `.contentrain/` structure
3. validate it
4. review it through branches and UI
5. consume it through a typed runtime client

## 🔄 Core Workflow

### 1. Initialize a project

`contentrain init` creates the `.contentrain/` workspace, project config, vocabulary, context file, git-safe defaults, and project-level agent rules.

```bash
npx contentrain init
```

### 2. Model and write content

Content is stored in a deterministic JSON and markdown structure inside `.contentrain/`.

The MCP layer handles:

- config
- models
- entries
- metadata
- validation
- branch lifecycle

The agent decides *what* to write.
The system decides *how* it is stored and reviewed.

### 3. Validate and review

```bash
contentrain validate
contentrain diff
contentrain serve
```

Write operations can flow through review branches instead of mutating the base branch directly.

That gives you:

- auditability
- safer collaboration with agents
- cleaner merge flow
- branch-pressure awareness

### 4. Generate the runtime client

```bash
contentrain generate
```

This produces `.contentrain/client/` and injects `#contentrain` imports into your project.

Then your app can read content through a typed generated client:

```ts
import { query, singleton, dictionary, document } from '#contentrain'

const hero = singleton('hero').locale('en').get()
const posts = query('blog-post').locale('en').all()
```

## ⚙️ How It Works

### MCP is deterministic infrastructure

`@contentrain/mcp` is the execution engine.

It manages:

- filesystem writes
- canonical serialization
- schema-aware validation
- git-backed branch workflow
- normalize scan and apply flows
- context tracking

It does **not** decide content semantics for you.

That boundary is deliberate.

### The agent is the intelligence layer

The agent decides:

- whether a string is user-facing
- how to model content
- what key or entry should be created
- which replacement expression is correct for the current framework

This split matters.

Contentrain is designed around:

- **MCP = deterministic infra**
- **Agent = intelligence**

That is the reason the system stays predictable even when the content work itself is AI-assisted.

### Rules and skills are first-class

Most tools stop at APIs.

Contentrain also packages how agents should behave:

- `@contentrain/rules` defines policy and constraints
- `@contentrain/skills` defines workflow playbooks and framework-specific guidance

This makes agent behavior part of the product surface instead of leaving it implicit.

## 🧠 Key Design Principles

- **JSON only**  
  Contentrain uses JSON and markdown. No YAML storage layer.

- **Git is mandatory**  
  Content work is part of the repository lifecycle, not a side channel.

- **Review is a product feature**  
  Branch-backed review is not an afterthought; it is part of the core workflow.

- **Generated runtime over dynamic magic**  
  The SDK follows a generate-then-consume model instead of late-bound runtime filesystem reads.

- **Framework-agnostic core**  
  Stack-specific decisions belong to the agent and framework guides, not to the MCP engine.

- **Local-first**  
  The MCP layer works locally and does not depend on a hosted Git provider API.

## 🚀 What Makes Contentrain Different

Contentrain is not best described as a CMS.

It is closer to a **content governance operating layer for codebase-native teams**.

It combines traits from several categories:

- headless CMS: models, entries, locales
- GitOps: review branches, merge flow, auditability
- MCP tooling: agent-native local execution
- code generation: typed runtime client
- agent operations: rules and workflow skills

That combination is the point.

The problem Contentrain solves is not just "where should content live?"

It is:

**How do we let AI agents work on content inside a real codebase without turning the repository into chaos?**

## 🚀 Quick Start

Requirements:

- Node.js 22+
- pnpm 9+
- Git in `PATH`

Install dependencies:

```bash
pnpm install
```

Initialize a project:

```bash
contentrain init
```

Inspect state:

```bash
contentrain status
contentrain doctor
```

Generate the SDK:

```bash
contentrain generate
```

Open the local UI:

```bash
contentrain serve
```

Use MCP over stdio for IDE agents:

```bash
contentrain serve --stdio
```

## 🛠 Example Use Cases

### Normalize hardcoded strings

Scan a product codebase, extract user-facing strings into governed content, and patch source files through a two-phase normalize workflow.

### Run AI-assisted docs or marketing workflows

Let an agent propose docs, landing page copy, or UI labels while keeping schema, locale coverage, and review flow intact.

### Build app-facing content without a separate CMS

Store content in the repo, generate a typed runtime client, and consume it from Vue, React, Next, Nuxt, Node, Expo, or React Native.

### Standardize agent behavior across IDEs

Ship the same behavioral rules to Claude Code, Cursor, Windsurf, and generic agent setups.

## 📦 Package Guide

If you want to go deeper package by package:

- [`packages/mcp/README.md`](packages/mcp/README.md)
- [`packages/cli/README.md`](packages/cli/README.md)
- [`packages/types/README.md`](packages/types/README.md)
- [`packages/rules/README.md`](packages/rules/README.md)
- [`packages/skills/README.md`](packages/skills/README.md)
- [`packages/sdk/js/README.md`](packages/sdk/js/README.md)

## 📚 Documentation and Release Sources

The old internal spec files are no longer the source of truth.

Current sources:

- this root README for product and monorepo overview
- package READMEs for public package contracts
- [`RELEASING.md`](RELEASING.md) for versioning and publish flow
- `packages/rules/` and `packages/skills/` for agent-facing operational guidance

The future canonical docs site will live under `docs/`.

## 🧪 Development

From the monorepo root:

```bash
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## 🚢 Release

Contentrain uses package-specific versioning for public packages. `@contentrain/query` and `@contentrain/mcp` follow their existing npm lines; the other packages start from the `0.1.x` line.

```bash
pnpm release:version
pnpm release:check
pnpm release:pack
```

For the full release workflow, see [`RELEASING.md`](RELEASING.md).

## 📄 License

MIT
