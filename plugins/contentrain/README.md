# Contentrain — Claude Code plugin

**Turn hardcoded strings into governed content.**

Your codebase is full of content: UI labels, empty states, validation
messages, marketing copy, docs. It's hardcoded across dozens of files,
invisible to anyone who isn't a developer, and impossible to translate.

This plugin gives Claude the tools to fix that in place, in your own Git
repo — no account, no database, no vendor lock-in.

## Install

```
/plugin marketplace add Contentrain/ai
/plugin install contentrain@contentrain
```

Then run `/reload-plugins`.

## What it does

Ask Claude to scan your project and it finds the hardcoded strings, proposes
a content model for them, extracts them into typed JSON or Markdown under
`.contentrain/`, and patches the source to read from a generated, type-safe
client. From then on the content is queryable, translatable, and reviewable
as ordinary Git history.

Extraction and source patching are two separate phases, each landing on its
own review branch. Phase 1 alone is useful: content becomes manageable and
translatable without touching a single source file.

## What's included

| Skill | Job |
|---|---|
| `contentrain` | Core architecture, field types, MCP tool catalog |
| `contentrain-init` | Set up `.contentrain/` in an existing repo |
| `contentrain-normalize` | The two-phase extract-and-patch flow |
| `contentrain-model` | Design and save content models |
| `contentrain-validate-fix` | Validate against schema, auto-fix structural issues |
| `contentrain-review` | Review content changes before publishing |
| `contentrain-serve` | Local review UI |

Framework guidance for Vue, Nuxt, Next.js, React, Astro, SvelteKit, Node,
Expo, and React Native loads on demand during source patching, so it costs
nothing until the stack is detected.

The bundled MCP server performs every file operation deterministically —
canonical serialization, schema validation, Git-backed safety — so an agent
can't corrupt a model or invent a field. Content decisions stay with the
agent; the server is infrastructure.

## Requirements

Node 22+ and a Git repository. The MCP server is fetched from npm on first
use (`@contentrain/mcp`).

## Beyond local

Everything here runs locally against your repository. When the work becomes
team work — review, roles, media, publishing — the same content model
connects to [Contentrain Studio](https://contentrain.io) without changing a
file.

MIT licensed. Docs at [ai.contentrain.io](https://ai.contentrain.io).

---

`skills/` and `frameworks/` are generated from `packages/skills/` by
`pnpm plugin:build`. Don't edit them by hand — CI regenerates and fails on a
dirty diff.
