---
title: HTTP Transport
description: Run the Contentrain MCP server over HTTP for Studio, CI runners, and remote agent drivers — with Bearer authentication.
slug: http-transport
---

# HTTP Transport

The MCP server ships two transports. The default — stdio — is for IDE integration. The HTTP transport serves tool calls at `POST /mcp` so agents running on a different machine can drive Contentrain operations against a project.

Typical drivers:

- **Contentrain Studio** — hosts an agent that talks to MCP over HTTP, backed by a GitHubProvider or GitLabProvider pointed at a team's content repo.
- **CI runners** — deterministic content operations as part of a pipeline (scaffold, validate, submit).
- **Remote agents** — any MCP client that wants to operate a Contentrain project without a local checkout.

All three tunnel the same 17 tools through the same `RepoProvider` contract. Which backend answers depends on how the server is wired — see [Providers & Transports](/guides/providers) for the capability matrix.

## Starting the HTTP server

The simplest path is the CLI:

```bash
contentrain serve --mcpHttp --authToken $(openssl rand -hex 32)
```

This binds to `localhost:3333` by default, uses the current working directory as the project root, and wraps it in a `LocalProvider`. Flags:

- `--port <n>` (`CONTENTRAIN_PORT`) — listen port
- `--host <bind>` (`CONTENTRAIN_HOST`) — bind address. Default `localhost`; set to `0.0.0.0` to accept remote connections
- `--authToken <token>` (`CONTENTRAIN_AUTH_TOKEN`) — Bearer token required for every request
- `--root <path>` (`CONTENTRAIN_PROJECT_ROOT`) — project root when not the cwd

MCP tool calls land at `POST <host>:<port>/mcp`. Any other path returns 404.

## Authentication

When `--authToken` is set (or `CONTENTRAIN_AUTH_TOKEN` is exported), every request must carry `Authorization: Bearer <token>`. Missing or mismatched tokens get `401 Unauthorized` before the MCP session initialises.

```bash
curl -X POST http://localhost:3333/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"contentrain_describe_format","arguments":{}}}'
```

Auth is optional in dev — omit `--authToken` when binding to `localhost`. Production deployments should always set one.

## Programmatic embedding

CLI-wrapped HTTP always uses `LocalProvider`. To run HTTP against a remote provider (GitHub, GitLab) embed the server programmatically:

```ts
import { createGitHubProvider } from '@contentrain/mcp/providers/github'
import { startHttpMcpServerWith } from '@contentrain/mcp/server/http'

const provider = await createGitHubProvider({
  auth: { type: 'pat', token: process.env.GITHUB_TOKEN! },
  repo: { owner: 'acme', name: 'site' },
})

const handle = await startHttpMcpServerWith({
  provider,
  port: 3333,
  host: '0.0.0.0',
  authToken: process.env.MCP_BEARER_TOKEN,
})

// handle.url contains the fully-qualified URL, e.g. http://0.0.0.0:3333/mcp
// handle.close() stops the server
```

The same pattern works for `createGitLabProvider` with a `GitLabProvider`. Both require their respective optional peers (`@octokit/rest`, `@gitbeaker/rest`).

## Deployment patterns

### Studio (hosted agent)

Studio's agent builds a GitHubProvider or GitLabProvider per tenant, points it at the tenant's content repo, and talks to an embedded MCP server over HTTP+LocalProvider-style wiring but with a remote provider. Each session is ephemeral.

### CI

A GitHub Actions job can:

1. Check out the repository
2. `pnpm install`
3. Start `contentrain serve --mcpHttp --authToken $CI_TOKEN &`
4. Drive it with an MCP client (Claude, Cursor-headless, or a custom JSON-RPC client)
5. Let `contentrain_submit` push the review branch

Because `contentrain serve --mcpHttp` uses `LocalProvider`, every tool — including normalize and submit — is available.

### Remote agent

An agent running on a laptop can drive a Contentrain project that lives on a server by connecting to the server's HTTP MCP endpoint (over a VPN or behind a reverse proxy with TLS + Bearer auth). The agent sees the full tool surface; capability gates still apply based on the backing provider.

## Capability gates over HTTP

Not every tool works on every provider. A tool driven by an HTTP client against a remote provider returns a structured capability error when the required capability is missing:

```json
{
  "error": "contentrain_scan requires local filesystem access.",
  "capability_required": "astScan",
  "hint": "This tool is unavailable when MCP is driven by a remote provider. Use a LocalProvider or the stdio transport."
}
```

Agent drivers should treat `capability_required` as a retry signal — prompt the user to switch transports, or fall back to a local-checkout session for that specific tool.

## Security notes

- Never expose HTTP MCP without `--authToken` on a non-`localhost` bind.
- Rotate tokens regularly; MCP does not support ACLs at the tool level, so a token is full project access.
- When Studio connects, the token is managed per workspace — see the Studio docs for the rotation workflow.
- All writes create feature branches from `contentrain`; the singleton source-of-truth branch is protected from direct pushes in team configurations.

## Next steps

- [Providers & Transports](/guides/providers) — deeper reference for each backend.
- [MCP package docs](/packages/mcp) — tool catalogue and response shapes.
- [Contentrain Studio](/studio) — the hosted surface that drives HTTP MCP.
