# Contentrain AI

AI skills and rules for managing [Contentrain](https://contentrain.io) CMS content across all AI tools.

Works **with or without MCP** — when the `@contentrain/mcp` server is available, AI agents use it for git-synced operations. When it's not, they fall back to direct file editing with the same rules.

## What's Included

| File | Tool | Type | Description |
|------|------|------|-------------|
| `skills/contentrain/SKILL.md` | Claude Code | Auto-invoked skill | Claude automatically uses this when working with Contentrain projects |
| `commands/contentrain.md` | Claude Code | `/contentrain` command | User-invoked slash command for content management |
| `.mcp.json` | Claude Code | MCP config | Connects `@contentrain/mcp` server for git-synced operations |
| `cursor/contentrain.mdc` | Cursor | Rule | Activates when editing files in `contentrain/` directory |

## Setup

### Claude Code (Plugin)

Install as a Claude Code plugin:

```bash
claude plugin add /path/to/contentrain-ai
```

This gives you:
- Auto-invoked skill (Claude uses it automatically for Contentrain projects)
- `/contentrain` slash command
- MCP server integration (if `@contentrain/mcp` is installed globally)

### Claude Code (Manual)

Copy the skill to your commands directory:

```bash
cp commands/contentrain.md ~/.claude/commands/contentrain.md
```

### Cursor

Copy the rule to your project's Cursor rules:

```bash
mkdir -p .cursor/rules
cp cursor/contentrain.mdc .cursor/rules/contentrain.mdc
```

Or install globally:

```bash
mkdir -p ~/.cursor/rules
cp cursor/contentrain.mdc ~/.cursor/rules/contentrain.mdc
```

### MCP Server (Optional)

For git-synced operations (auto commit + push), install the MCP server:

```bash
npm install -g @contentrain/mcp
```

The `.mcp.json` in this plugin will automatically connect to it.

## How It Works

```
User: "Create a blog model with title and category fields"

┌─────────────────────────────────┐
│ AI Agent (Claude, Cursor, etc.) │
│                                 │
│ 1. Checks for MCP tools        │
│    ├─ YES → Use MCP tools      │
│    │   (git sync, validation)   │
│    └─ NO → Direct file editing  │
│       (follows skill rules)     │
│                                 │
│ 2. Creates model metadata       │
│ 3. Adds field definitions       │
│ 4. Creates content directory    │
│ 5. Validates all rules          │
└─────────────────────────────────┘
```

## Prerequisites

- A Contentrain project set up via the [Contentrain Web App](https://app.contentrain.io)
- The project's GitHub repository cloned locally

## License

MIT
