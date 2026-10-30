---
title: FAQ
description: Short answers about Contentrain AI — where content lives, which agents and frameworks work with it, how writes are reviewed, MCP over HTTP, remote providers, CI validation and i18n
---

# Frequently Asked Questions

### What is Contentrain AI?

The MIT-licensed open-source toolkit of Contentrain: an MCP server (`@contentrain/mcp`), a CLI (`contentrain`), shared types, agent rules and skills, and a generated, typed query SDK (`@contentrain/query`). AI agents use it to extract, structure and edit content in your own Git repository through deterministic tools, and people review the result as ordinary Git branches.

### Do I need an account or a hosted service?

No. Everything runs locally against your repository: no account, no database, no cloud dependency. [Contentrain Studio](/studio) is an optional hosted surface for team review, roles, media and CDN delivery on top of the same files.

### Where does my content live?

In your repository, under `.contentrain/`: models in `.contentrain/models/`, content as canonical JSON or Markdown in `.contentrain/content/`, and entry status and scheduling in `.contentrain/meta/`. If you stop using Contentrain, the files stay readable and portable. See [Configuration](/reference/config).

### Which AI agents and IDEs work with it?

Any MCP client. `contentrain setup` writes the MCP config for Claude Code, Cursor, VS Code, Windsurf, GitHub Copilot and OpenAI Codex, and Claude Code users can install the [plugin](/packages/plugin) with one command. See [Getting Started](/getting-started).

### How many MCP tools are there?

27: 22 core tools and 5 media tools. The list is filtered per session: a local stdio server lists the 22 core tools, and the media tools appear only on providers with a media stack, such as Studio MCP Cloud. See [MCP Tools](/packages/mcp).

### Does the agent write straight to my main branch?

No. Every write is a Git transaction on an isolated `cr/*` branch. With the `auto-merge` workflow the change is merged into the `contentrain` branch at once; with `review` it waits on its branch for a person to merge it. Destructive tools require `confirm: true`.

### Can I preview a change before it is written?

Yes, where it matters. `contentrain_apply` (the normalize tool that can patch source files) and `contentrain_reconcile` default to `dry_run: true`, and `contentrain_bulk` takes an optional `dry_run`.

### Can I run the MCP server over HTTP?

Yes: `contentrain serve --mcpHttp` serves Streamable HTTP at `/mcp`. With `--authToken`, every request needs `Authorization: Bearer <token>`. The CLI refuses to bind a non-loopback host without a token. See [HTTP Transport](/guides/http-transport).

### Does it work against GitHub or GitLab without a local checkout?

Yes, through the optional GitHub and GitLab providers. Without a local worktree, the session lists 11 of the 22 core tools, the ones that can run remotely; tools that need a working tree, such as normalize, submit and merge, are not registered. See [Providers & Transports](/guides/providers).

### How does my app read the content?

`contentrain generate` emits a typed client into `.contentrain/client/` and adds a `#contentrain` import to `package.json`. Your code queries collections, singletons, dictionaries and documents through it, with no runtime dependency on a service. See [Query SDK](/packages/sdk).

### Which frameworks are supported?

The generated client is plain ESM/CJS, so any JavaScript runtime works. Agent guides exist for Vue, Nuxt, Next.js, React, Astro, SvelteKit, Node, Expo and React Native. See [Framework Integration](/guides/frameworks).

### Can I validate content in CI?

Yes. `contentrain validate` exits 1 when the project is invalid, in pretty and `--json` mode, so it can gate a pipeline step. `contentrain doctor --json` also exits non-zero on failed checks. See [CLI](/packages/cli).

### How are translations handled?

`config.json` declares a default locale and the supported locales, and each model chooses whether it is localized and how locale is encoded in file names (`file`, `suffix`, `directory`, or `none` for non-localized models). `validate` reports a missing locale file as an error and untranslated entries or dictionary keys as warnings. See [i18n Workflow](/guides/i18n).

### Is there a machine-readable version of these docs?

Yes: [/llms.txt](https://ai.contentrain.io/llms.txt) is the index, and [/llms-full.txt](https://ai.contentrain.io/llms-full.txt) is the full documentation as one file.
