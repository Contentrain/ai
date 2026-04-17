---
title: Embedding MCP in a Host Application
description: How to consume @contentrain/mcp from inside another application — transports, providers, authentication, capability gating, and extension points. Includes Studio as a reference integration.
slug: embedding-mcp
---

# Embedding MCP in a Host Application

`@contentrain/mcp` is distributed as a standalone package so it can be embedded in any Node.js host — a hosted CMS, a CI runner, a custom agent driver, an internal tool. This guide walks through the shapes that integration can take and the primitives you'll touch.

Studio (`contentrain.io`) is the canonical consumer; the patterns below describe what Studio does and what third parties should do to match it.

## What you're embedding

`@contentrain/mcp` ships three pieces you plug together:

1. **A `RepoProvider`** — Local / GitHub / GitLab (or your own). Wraps whatever git backend you're targeting.
2. **An `McpServer`** — the MCP JSON-RPC surface with all 17 Contentrain tools registered.
3. **A transport** — stdio (for IDE agents) or HTTP (for hosted / remote drivers).

The three are orthogonal. Mix them freely.

## Installation

```bash
pnpm add @contentrain/mcp @contentrain/types
```

Remote providers ship as optional peers — install only the ones you'll use:

```bash
# For GitHub-backed sessions
pnpm add @octokit/rest

# For GitLab-backed sessions
pnpm add @gitbeaker/rest
```

A pure-LocalProvider embedding (just wrapping a working tree) needs neither peer.

## Construction recipes

### 1. Stdio + LocalProvider (IDE agents)

```ts
import { createServer } from '@contentrain/mcp/server'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = createServer('/path/to/project')
const transport = new StdioServerTransport()
await server.connect(transport)
```

This is what `contentrain serve --stdio` does internally. Every IDE that speaks MCP (Claude Code, Cursor, Windsurf) talks to this shape.

### 2. HTTP + LocalProvider (local CI, Studio-like hosting pointed at a working tree)

```ts
import { startHttpMcpServer } from '@contentrain/mcp/server/http'

const handle = await startHttpMcpServer({
  projectRoot: '/path/to/project',
  port: 3333,
  host: '0.0.0.0',
  authToken: process.env.MCP_BEARER_TOKEN,
})

// handle.url — "http://0.0.0.0:3333/mcp"
// handle.close() — shuts down when you're done
```

CLI equivalent: `contentrain serve --mcpHttp --authToken $TOKEN`.

### 3. HTTP + Remote Provider (Studio's pattern)

```ts
import { createGitHubProvider } from '@contentrain/mcp/providers/github'
import { startHttpMcpServerWith } from '@contentrain/mcp/server/http'

const provider = await createGitHubProvider({
  auth: { type: 'pat', token: await exchangeInstallationToken(installationId) },
  repo: { owner: 'acme', name: 'site' },
})

const handle = await startHttpMcpServerWith({
  provider,
  port: 3333,
  authToken: workspaceBearerToken,
})
```

Swap in `createGitLabProvider({ auth, project })` for GitLab. Self-hosted GitLab instances pass `project.host`.

### 4. Programmatic tool calls (no transport at all)

If you want to run a Contentrain tool inside your own Node.js process without MCP's JSON-RPC layer:

```ts
import { planContentSave } from '@contentrain/mcp/core/ops'
import { OverlayReader } from '@contentrain/mcp/core/overlay-reader'
import { buildContextChange } from '@contentrain/mcp/core/context'
import { validateProject } from '@contentrain/mcp/core/validator'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'

const plan = await planContentSave(provider, { model, entries, config, vocabulary })
if (plan.result.some(r => r.error)) throw new Error('plan invalid')

const overlay = new OverlayReader(provider, plan.changes)
const contextChange = await buildContextChange(overlay, {
  tool: 'save_content',
  model: model.id,
  locale: entries[0].locale,
})

const allChanges = [...plan.changes, contextChange]
  .toSorted((a, b) => a.path.localeCompare(b.path))

const commit = await provider.applyPlan({
  branch: 'cr/content/blog/2026-04-17-abcd',
  changes: allChanges,
  message: 'content: save blog',
  author: { name: 'Your Bot', email: 'bot@example.com' },
  // base omitted → defaults to CONTENTRAIN_BRANCH
})

const validation = await validateProject(overlay, { model: model.id })
```

Use this shape when you want tool-level control without the JSON-RPC envelope.

## Critical primitives

Three primitives matter when you build a non-local write path. Studio ran into all three during integration; get them right up front.

### `CONTENTRAIN_BRANCH` is the fork point, always

Every feature branch (`cr/content/...`, `cr/model/...`, `cr/normalize/...`) forks from the singleton `contentrain` branch. NOT from the repo's default branch (`main` / `master` / `trunk`). The content-tracking branch is the SSOT; the default branch is downstream.

`provider.applyPlan({ ..., base })` defaults to `CONTENTRAIN_BRANCH` when `base` is omitted. That's the contract. Pass `base` explicitly only when you know you're opting out of the invariant.

### `OverlayReader` for post-commit consistency

`buildContextChange` and `validateProject` take a reader. If you pass the raw provider, they read the pre-change base branch — so your committed `context.json` reports stale entry counts and post-save validation evaluates the wrong state.

Wrap the reader with `OverlayReader(reader, plan.changes)`. It layers pending `FileChange`s on top: adds become visible, deletes look missing, everything else falls through. The resulting context + validation reflect the state your commit is about to produce.

This is only needed for remote / reader-based flows. `LocalProvider`'s transaction writes the worktree before context/validation run, so the filesystem itself is the overlay.

### `capability_required` is a structured error

Tools that need capabilities the active provider doesn't expose return:

```json
{
  "error": "contentrain_scan requires local filesystem access.",
  "capability_required": "astScan",
  "hint": "This tool is unavailable when MCP is driven by a remote provider. Use a LocalProvider or the stdio transport."
}
```

Treat `capability_required` as a retry signal at the client. Typical fallback: prompt the user to switch to a local checkout, or downgrade the request (e.g. `content_list` with `resolve: true` → `resolve: false`).

See [Providers & Transports](/guides/providers) for the full capability matrix.

## Authentication

- **Stdio** — no authentication. Transport is localhost pipes; security boundary is the OS.
- **HTTP** — optional Bearer token. Set `authToken` on `startHttpMcpServer` / `startHttpMcpServerWith`, and require clients to send `Authorization: Bearer <token>`. Missing or mismatched tokens get `401` before any MCP session initialises.
- **Upstream git hosts** — provider auth (PAT / OAuth / GitHub App installation token / GitLab job token) is scoped per-provider. See the provider's factory docstring.

Rotate Bearer tokens regularly. MCP does not support per-tool ACLs; a valid token is full project access.

## Capability gating

Each provider advertises a `ProviderCapabilities` manifest. Tools gate on capabilities and reject uniformly when the active provider can't satisfy them.

| Capability | Local | GitHub | GitLab | Gated tools |
|---|---|---|---|---|
| `localWorktree` | ✓ | — | — | `init`, `scaffold`, `validate --fix`, `submit`, `merge`, `bulk` |
| `sourceRead` | ✓ | — | — | `apply` (extract) |
| `sourceWrite` | ✓ | — | — | `apply` (reuse) |
| `astScan` | ✓ | — | — | `scan` |
| `pushRemote` | ✓ | ✓ | ✓ | `submit` |
| `branchProtection` | — | ✓ | ✓ | merge fallback |
| `pullRequestFallback` | — | ✓ | ✓ | merge fallback |

Read-only tools (`status`, `describe`, `describe_format`, `content_list`, `validate` without `--fix`) work on every provider — they use only the reader surface.

## Extension: custom providers

If your host doesn't use Local / GitHub / GitLab, implement `RepoProvider` directly:

```ts
import type { RepoProvider, ProviderCapabilities } from '@contentrain/types'

class MyProvider implements RepoProvider {
  readonly capabilities: ProviderCapabilities = {
    localWorktree: false,
    sourceRead: false,
    sourceWrite: false,
    pushRemote: true,
    branchProtection: false,
    pullRequestFallback: false,
    astScan: false,
  }

  async readFile(path, ref?) { /* your backend */ }
  async listDirectory(path, ref?) { /* your backend */ }
  async fileExists(path, ref?) { /* your backend */ }

  async applyPlan(input) {
    // Single atomic commit. Honour input.base (default CONTENTRAIN_BRANCH).
  }

  async listBranches(prefix?) { /* ... */ }
  async createBranch(name, fromRef?) { /* ... */ }
  async deleteBranch(name) { /* ... */ }
  async getBranchDiff(branch, base?) { /* ... */ }
  async mergeBranch(branch, into) { /* ... */ }
  async isMerged(branch, into?) { /* ... */ }
  async getDefaultBranch() { /* ... */ }
}

const server = createServer({ provider: new MyProvider() })
```

The reference implementations under `packages/mcp/src/providers/{local,github,gitlab}/` are ~500 lines each and mirror the same structure. Start there.

For the full contract see [RepoProvider Reference](/reference/providers).

## Reference integrations

### Contentrain Studio

Studio is the canonical hosted integration. It hosts an HTTP MCP server per workspace, backed by `GitHubProvider` or `GitLabProvider` pointing at the customer's content repo. Bearer tokens are managed per workspace; quota and plan gates sit in a thin middleware in front of MCP. Studio never runs local-only tools (normalize, submit, etc.) — those delegate to the customer's own local checkout.

See [Studio Overview](/studio) for the product surface and `.internal/refactor/02-studio-handoff.md` in the monorepo for the detailed Studio-side integration plan (Studio-repo-specific).

### CI runners

A GitHub Actions job:

1. `actions/checkout@v4`
2. `pnpm install`
3. Start `contentrain serve --mcpHttp --authToken $CI_TOKEN &` (LocalProvider under the hood)
4. Drive it with an MCP client
5. Let `contentrain_submit` push the `cr/*` branch

All 17 tools are available because the runner has `LocalProvider`.

### Scripted automation

A nightly script that regenerates translation stubs via `contentrain_content_save` over GitHub:

```ts
const provider = await createGitHubProvider({
  auth: { type: 'pat', token: process.env.GH_TOKEN! },
  repo: { owner: 'acme', name: 'site' },
})
// run planContentSave + commit directly (recipe 4 above)
```

No HTTP, no MCP JSON-RPC — just the core primitives.

## Going deeper

- [Providers & Transports](/guides/providers) — capability matrix, when to use which provider
- [HTTP Transport](/guides/http-transport) — deployment patterns, Bearer auth
- [RepoProvider Reference](/reference/providers) — contract definitions
- [MCP package reference](/packages/mcp) — full tool catalogue

## Troubleshooting

**`ERR_PACKAGE_PATH_NOT_EXPORTED`** — you're reaching into a subpath that isn't in `package.json#exports`. Known good subpaths: `/server`, `/server/http`, `/core/config`, `/core/context`, `/core/contracts`, `/core/model-manager`, `/core/content-manager`, `/core/validator`, `/core/ops`, `/core/overlay-reader`, `/core/scanner`, `/core/graph-builder`, `/core/apply-manager`, `/core/scan-config`, `/providers/local`, `/providers/github`, `/providers/gitlab`, `/util/detect`, `/util/fs`, `/git/transaction`, `/git/branch-lifecycle`, `/templates`.

**Stale context.json stats after a remote commit** — you forgot `OverlayReader`. `buildContextChange(provider, op)` reads the pre-change branch; wrap with `new OverlayReader(provider, plan.changes)`.

**Feature branch forked from main instead of contentrain** — you passed `base: config.repository?.default_branch` somewhere. Remove it; the default is `CONTENTRAIN_BRANCH`.

**`@octokit/rest` / `@gitbeaker/rest` not found at runtime** — optional peer isn't installed. Add it to your host's dependencies; the factory throws with this hint.

**Validation passes but the commit still contains bad data** — you're running `validateProject(provider, ...)` without the overlay on a remote path. Same fix: wrap the reader.
