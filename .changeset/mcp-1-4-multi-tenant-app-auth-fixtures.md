---
"@contentrain/mcp": minor
---

feat(mcp): 1.4.0 — multi-tenant HTTP MCP, GitHub App auth, published conformance fixtures

### Multi-tenant HTTP MCP — per-request provider resolver

`startHttpMcpServerWith` now accepts a `resolveProvider(req)` callback
instead of (or in addition to) a single pre-built provider. Every new
MCP session resolves its own `RepoProvider` from the incoming HTTP
request — Studio's MCP Cloud and any similar hosted agent can serve
many projects from one endpoint without spinning up N server
instances.

```ts
await startHttpMcpServerWith({
  resolveProvider: async (req) => {
    const projectId = req.headers['x-project-id']
    const { repo, auth } = await lookupProject(projectId)
    return createGitHubProvider({ auth, repo })
  },
  authToken: workspaceBearerToken,
  port: 3333,
  sessionTtlMs: 15 * 60 * 1000, // default 15m
})
```

Resolver invoked exactly once per MCP session; subsequent requests
carrying `Mcp-Session-Id` reuse the resolved server + transport pair.
Idle sessions are disposed after `sessionTtlMs`. Existing single-
provider shape is fully backward compatible.

### GitHub App installation auth in the factory

`createGitHubProvider({ auth: { type: 'app', appId, privateKey,
installationId } })` now mints a short-lived JWT, exchanges it for an
installation access token, and instantiates Octokit with the
resulting bearer. Removes the old "`app` auth coming in Phase 5.2"
throw.

New public exports under `@contentrain/mcp/providers/github`:
- `exchangeInstallationToken(config, opts?)` — standalone helper,
  useful when callers want to cache / refresh tokens externally
  (redis, KV, cross-worker pool). Supports custom `baseUrl` for
  GitHub Enterprise Server.
- `signAppJwt(config)` — pure JWT signer (RS256, 10-min TTL).
- Types: `AppAuthConfig`, `InstallationTokenResult`.

The factory ships a ~1-hour bearer and does not auto-refresh — for
long-lived hosted providers, inject your own Octokit with
`@octokit/auth-app`'s auth strategy instead (Studio's pattern — see
the embedding guide).

### Conformance fixtures published

New subpath export `@contentrain/mcp/testing/conformance` exposes the
byte-parity scenarios the package tests itself against, so external
tools (Studio, alt-provider harnesses, third-party reimplementations)
can assert matching output without symlinking `packages/mcp/tests/`.

Fixtures were moved from `packages/mcp/tests/fixtures/conformance/`
to `packages/mcp/testing/conformance/` and are included in the
published tarball via `files[]`. Helpers:

```ts
import {
  fixturesDir,
  listConformanceScenarios,
  loadConformanceScenario,
} from '@contentrain/mcp/testing/conformance'
```

### `validateProject(reader, options)` overload pinned

Phase 5.5b's reader overload got a dedicated test file
(`tests/core/validator/reader-overload.test.ts`) that exercises:
- validation through a pure `RepoReader`
- error surfacing from reader-backed content
- `OverlayReader` composition — the exact shape Studio uses for
  pre-commit validation

The test pins the contract so the overload cannot regress silently.

### Docs

`docs/guides/embedding-mcp.md` Recipe 3 now shows **three** GitHub App
auth patterns with a trade-off table:
1. Factory `auth.type: 'app'` — simple, 1-hour TTL
2. `exchangeInstallationToken` + external cache — manual refresh
3. Octokit injection with `@octokit/auth-app` — auto-refresh
   (recommended for Studio-style hosted providers)

Plus a new 3a section showing the multi-tenant resolver pattern.

Package description updated from "13 deterministic tools" to
accurately describe the current 17-tool surface.

### Verification

- `oxlint` across the monorepo → 0 warnings on 424 files.
- `@contentrain/mcp` typecheck → 0 errors.
- MCP fast suite → **471 passed / 2 skipped / 34 files** (21 new
  tests beyond 1.3.0 baseline: 4 app-auth, 3 resolver, 5 conformance
  subpath, 3 validateProject reader, plus the fixture-move
  adjustments).
- `vitepress build docs/` → success.
