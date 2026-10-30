---
title: Claude Code Plugin
description: "The Contentrain plugin for Claude Code and Cursor — the MCP server, 7 core skills and 9 framework guides in one install; turn hardcoded strings into governed content in your own repo"
order: 12
slug: plugin
---

# Claude Code Plugin

The shortest path to a working Contentrain agent. The plugin bundles the
[MCP server](/packages/mcp), seven of the [Agent Skills](/packages/skills) and
the framework guides, so Claude can scan a project, extract its hardcoded
strings into `.contentrain/`, and patch the source to read from the
[generated client](/packages/sdk), all in your own Git repository.

| | |
|---|---|
| Version | 1.0.9 |
| Distribution | Plugin marketplace in the `Contentrain/ai` repository (not npm) |
| Source | [`plugins/contentrain/`](https://github.com/Contentrain/ai/tree/main/plugins/contentrain) |
| License | MIT |

## Install

In Claude Code:

```
/plugin marketplace add Contentrain/ai
/plugin install contentrain@contentrain
```

Then run `/reload-plugins`.

The same payload ships as a Cursor plugin: the repository has a
`.cursor-plugin/marketplace.json` at its root and a
`plugins/contentrain/.cursor-plugin/plugin.json` with the same skills, MCP
server config and logo.

Requirements: Node.js 22+ and a Git repository. No account is needed.

## What it includes

**MCP server.** The plugin's `.mcp.json` starts the current major of the server
from npm on first use:

```json
{
  "mcpServers": {
    "contentrain": {
      "command": "npx",
      "args": ["-y", "@contentrain/mcp@^3"]
    }
  }
}
```

It runs over stdio with `LocalProvider`, so the agent gets the 22 core
[MCP tools](/packages/mcp#tool-catalog).

**Skills** (7 of the 16 in [`@contentrain/skills`](/packages/skills)):

| Skill | Job |
|---|---|
| `contentrain` | Core architecture, field types, MCP tool catalog |
| `contentrain-init` | Set up `.contentrain/` in an existing repo |
| `contentrain-normalize` | The two-phase extract-and-patch flow |
| `contentrain-model` | Design and save content models |
| `contentrain-validate-fix` | Validate against the schema, auto-fix structural issues |
| `contentrain-review` | Review content changes before publishing |
| `contentrain-serve` | Local review UI |

**Framework guides** for Vue, Nuxt, Next.js, React, Astro, SvelteKit, Node,
Expo and React Native. They load on demand while the agent patches source,
so they cost nothing until the stack is detected.

## How it works

Ask Claude to scan your project. It finds hardcoded strings, proposes a content
model, extracts the strings into typed JSON or Markdown under `.contentrain/`,
and patches the source to read from the generated client. Extraction and source
patching are separate phases, each on its own review branch, so the first phase
alone already makes the content manageable and translatable without touching a
source file. See the [normalize flow](/guides/normalize).

## Plugin or manual setup?

| You want | Use |
|---|---|
| Claude Code, one command, curated skills | This plugin |
| Project-scoped MCP config for any IDE, all 16 skills | [`contentrain setup`](/packages/cli#contentrain-setup) and [`contentrain skills`](/packages/cli#contentrain-skills) |

## Versioning

The plugin is versioned by changesets like the npm packages. Its `skills/` and
`frameworks/` folders are generated from `packages/skills/` by
`pnpm plugin:build`, which also writes `.mcp.json` from the current major in
`packages/mcp/package.json`; CI fails when the generated payload is stale.

