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
2. **An `McpServer`** — the MCP JSON-RPC surface with every Contentrain tool the provider can satisfy registered (19 core + 5 media on media-capable providers).
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

`createServer` also accepts an options object — `createServer({ provider, projectRoot?, instructions? })` — where `instructions` overrides the MCP server instructions string advertised to clients.

This is what `contentrain serve --stdio` does internally. Every IDE that speaks MCP (Claude Code, Cursor, Windsurf) talks to this shape.

### 2. HTTP + LocalProvider (local CI, Studio-like hosting pointed at a working tree)

```ts
import { startHttpMcpServer } from '@contentrain/mcp/server/http'

const handle = await startHttpMcpServer({
  projectRoot: '/path/to/project',
  port: 3333,
  host: '0.0.0.0',
  authToken: process.env.MCP_BEARER_TOKEN,
  // path: '/mcp' — custom mount path, default '/mcp'
})

// handle.url — "http://0.0.0.0:3333/mcp"
// handle.close() — shuts down when you're done
```

CLI equivalent: `contentrain serve --mcpHttp --authToken $TOKEN`.

### 3. HTTP + Remote Provider (three patterns)

**a. Factory with GitHub App credentials.** Simplest for one-off scripts and CI runners — the factory signs the JWT, exchanges it for an installation token, and hands Octokit a bearer. The returned token lasts ~1 hour; at that point the factory must be re-called.

```ts
import { createGitHubProvider } from '@contentrain/mcp/providers/github'
import { startHttpMcpServerWith } from '@contentrain/mcp/server/http'

const provider = await createGitHubProvider({
  auth: {
    type: 'app',
    appId: Number(process.env.GITHUB_APP_ID),
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
    installationId: Number(process.env.GITHUB_INSTALLATION_ID),
  },
  repo: { owner: 'acme', name: 'site' },
})

const handle = await startHttpMcpServerWith({
  provider,
  port: 3333,
  authToken: workspaceBearerToken,
})
```

**b. `exchangeInstallationToken` helper for external token caching.** When you want to pin the token lifecycle yourself (cache across requests, refresh on a schedule, share across workers), call the helper directly and pass the opaque bearer to `createGitHubProvider({ auth: { type: 'pat', token } })`.

```ts
import {
  createGitHubProvider,
  exchangeInstallationToken,
} from '@contentrain/mcp/providers/github'

const { token, expiresAt } = await exchangeInstallationToken({
  appId: Number(process.env.GITHUB_APP_ID),
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  installationId: Number(process.env.GITHUB_INSTALLATION_ID),
})
// cache { token, expiresAt } in redis / your KV of choice

const provider = await createGitHubProvider({
  auth: { type: 'pat', token },
  repo: { owner: 'acme', name: 'site' },
})
```

**c. Inject your own Octokit with `@octokit/auth-app` (recommended for hosted / long-lived providers).** This is Studio's pattern. The Octokit SDK auto-refreshes installation tokens for the lifetime of the instance, so your provider never has to think about expiry.

```ts
import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import { GitHubProvider } from '@contentrain/mcp/providers/github'
import { startHttpMcpServerWith } from '@contentrain/mcp/server/http'

const octokit = new Octokit({
  authStrategy: createAppAuth,
  auth: {
    appId: Number(process.env.GITHUB_APP_ID),
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
    installationId: Number(process.env.GITHUB_INSTALLATION_ID),
  },
})

const provider = new GitHubProvider(octokit, { owner: 'acme', name: 'site' })

const handle = await startHttpMcpServerWith({
  provider,
  port: 3333,
  authToken: workspaceBearerToken,
})
```

**Trade-offs:**

| Pattern | Best for | Auto-refresh | Deps |
|---|---|---|---|
| a — factory `auth.type: 'app'` | Short-lived scripts, CI | No (1-hour TTL) | `@octokit/rest` |
| b — `exchangeInstallationToken` + PAT | External token cache (redis, KV) | You decide | `@octokit/rest` |
| c — Octokit injection + `@octokit/auth-app` | Long-lived hosted providers (Studio) | Yes | `@octokit/rest` + `@octokit/auth-app` |

For **multi-tenant** deployments where each request targets a different project, see the **per-request resolver** section below.

Swap in `createGitLabProvider({ auth, project })` for GitLab — `project.projectId` (numeric ID or `group/name` path) is required; self-hosted GitLab instances also pass `project.host`. Both remote providers accept an optional `contentRoot` on the repo/project ref for monorepos whose `.contentrain/` lives under a prefix.

### 3a. HTTP + per-request provider resolver (multi-tenant)

When one HTTP endpoint serves many projects (Studio's MCP Cloud), pass a `resolveProvider` function instead of a single provider. The resolver is invoked once per MCP session; subsequent requests with the same `Mcp-Session-Id` header reuse the same server + transport pair. Idle sessions are cleaned up after `sessionTtlMs` (default 15 minutes).

```ts
import { createGitHubProvider } from '@contentrain/mcp/providers/github'
import { startHttpMcpServerWith } from '@contentrain/mcp/server/http'

const handle = await startHttpMcpServerWith({
  resolveProvider: async (req) => {
    const projectId = req.headers['x-project-id'] as string
    const { repo, auth } = await lookupProjectFromDatabase(projectId)
    return createGitHubProvider({ auth, repo })
  },
  // Bind each session to its tenant: follow-up requests must produce the
  // same fingerprint or they get 404 and the client re-initializes.
  sessionFingerprint: (req) => req.headers['x-project-id'] as string,
  authToken: workspaceBearerToken,
  port: 3333,
  sessionTtlMs: 15 * 60 * 1000,
})
```

The single-provider shape (`{ provider }`) and the resolver shape (`{ resolveProvider }`) are mutually exclusive — pass one or the other.

**Session tenant binding.** A session's provider is resolved once, at `initialize`. Without `sessionFingerprint`, any caller that presents a known `Mcp-Session-Id` reaches that session's provider — fine on trusted loopback, not across tenants. Set `sessionFingerprint` to derive a stable tenant identity from each request (e.g. the same headers `resolveProvider` uses); a mismatch answers `404 Session not found`, which per the Streamable HTTP spec makes the client transparently re-initialize its own session.

### 4. Programmatic tool calls (no transport at all)

If you want to run a Contentrain tool inside your own Node.js process without MCP's JSON-RPC layer:

```ts
import { planContentSave } from '@contentrain/mcp/core/ops'
import { OverlayReader } from '@contentrain/mcp/core/overlay-reader'
import { buildContextChange } from '@contentrain/mcp/core/context'
import { validateProject } from '@contentrain/mcp/core/validator'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'

// Throws on invalid input; soft signals come back as per-entry advisories
const plan = await planContentSave(provider, { model, entries, config, vocabulary })
const advisories = plan.result.flatMap(r => r.advisories ?? [])

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

Tools whose requirements can never be met by the session's provider are not registered at all (see [Capability gating](#capability-gating)), so most capability mismatches never reach a handler. The structured error remains for the two input-dependent cases — `validate` with `fix: true` and `apply` in `reuse` mode:

```json
{
  "error": "contentrain_validate requires local filesystem access.",
  "capability_required": "localWorktree",
  "hint": "This tool is unavailable when MCP is driven by a remote provider (e.g. GitHubProvider). Use a LocalProvider or the stdio transport."
}
```

Treat `capability_required` as a retry signal at the client. Typical fallback: prompt the user to switch to a local checkout, or downgrade the request (e.g. `validate` without `fix`).

See [Providers & Transports](/guides/providers) for the full capability matrix.

## Authentication

- **Stdio** — no authentication. Transport is localhost pipes; security boundary is the OS.
- **HTTP** — optional Bearer token. Set `authToken` on `startHttpMcpServer` / `startHttpMcpServerWith`, and require clients to send `Authorization: Bearer <token>`. Missing or mismatched tokens get `401` before any MCP session initialises.
- **Upstream git hosts** — provider auth (PAT / OAuth / GitHub App installation token / GitLab job token) is scoped per-provider. See the provider's factory docstring.

Rotate Bearer tokens regularly. MCP does not support per-tool ACLs; a valid token is full project access.

## Capability gating

Each provider advertises a `ProviderCapabilities` manifest. `createServer` consults it (together with `projectRoot`) at registration time: tools whose requirements can never be met by the session's provider are **not registered**, so `tools/list` only shows what can actually run. The declarative requirement map is exported as `TOOL_REQUIREMENTS` from `@contentrain/mcp/tools/availability`, alongside an `isToolAvailable(name, provider, projectRoot)` helper for embedders that want to reason about the effective surface without spinning up a server.

| Capability | Local | GitHub | GitLab | Gated tools |
|---|---|---|---|---|
| `localWorktree` | ✓ | — | — | `validate --fix`, `submit`, `merge`, `branch_list`, `branch_delete` |
| `sourceRead` | ✓ | — | — | `apply` (extract) |
| `sourceWrite` | ✓ | — | — | `apply` (reuse) |
| `astScan` | ✓ | — | — | `scan` |
| `pushRemote` | ✓ | ✓ | ✓ | `submit` |
| `branchProtection` | — | ✓ | ✓ | merge fallback |
| `pullRequestFallback` | — | ✓ | ✓ | merge fallback |

`init`, `scaffold`, `doctor`, and `bulk` additionally require a local `projectRoot` on disk. Input-dependent checks (`validate --fix`, `apply` reuse) stay as call-time guards and return the structured `capability_required` error above.

The five `contentrain_media_*` tools gate on the provider's optional **media facet** (`RepoProvider.media` — an object implementing `MediaProvider` from `@contentrain/types`, not a boolean flag). Implement it on a custom provider to get the media tools registered; leave it absent and they never appear.

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

All 19 core tools are available because the runner has `LocalProvider` (media tools need a media-capable provider).

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

**`ERR_PACKAGE_PATH_NOT_EXPORTED`** — you're reaching into a subpath that isn't in `package.json#exports`. Known good subpaths: `/server`, `/server/http`, `/core/config`, `/core/context`, `/core/contracts`, `/core/model-manager`, `/core/content-manager`, `/core/validator`, `/core/doctor`, `/core/ops`, `/core/overlay-reader`, `/core/scanner`, `/core/graph-builder`, `/core/apply-manager`, `/core/scan-config`, `/providers/local`, `/providers/github`, `/providers/gitlab`, `/tools/annotations`, `/tools/availability`, `/testing/conformance`, `/util/detect`, `/util/fs`, `/git/transaction`, `/git/branch-lifecycle`, `/templates`.

**Stale context.json stats after a remote commit** — you forgot `OverlayReader`. `buildContextChange(provider, op)` reads the pre-change branch; wrap with `new OverlayReader(provider, plan.changes)`.

**Feature branch forked from main instead of contentrain** — you passed `base: config.repository?.default_branch` somewhere. Remove it; the default is `CONTENTRAIN_BRANCH`.

**`@octokit/rest` / `@gitbeaker/rest` not found at runtime** — optional peer isn't installed. Add it to your host's dependencies; the factory throws with this hint.

**Validation passes but the commit still contains bad data** — you're running `validateProject(provider, ...)` without the overlay on a remote path. Same fix: wrap the reader.
