import http from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer as createMcpServer, type ToolProvider } from '../../server.js'

export interface HttpMcpServerOptions {
  /** Project root the MCP server operates against (LocalProvider path). */
  projectRoot: string
  /** Optional Bearer token — when set, requests must send `Authorization: Bearer <token>`. */
  authToken?: string
  /** Mount path for the MCP JSON-RPC endpoint. Defaults to `/mcp`. */
  path?: string
}

export interface HttpMcpServerProviderOptions {
  /** Pre-built content provider (GitHubProvider, a mock, etc.). */
  provider: ToolProvider
  /** Local project root when the provider is a LocalProvider; optional otherwise. */
  projectRoot?: string
  /** Optional Bearer token — when set, requests must send `Authorization: Bearer <token>`. */
  authToken?: string
  /** Mount path for the MCP JSON-RPC endpoint. Defaults to `/mcp`. */
  path?: string
}

/**
 * Multi-tenant entry point — one resolver, many providers.
 *
 * Every new MCP session resolves its own `RepoProvider` from the incoming
 * HTTP request (typically via a workspace / project identifier in a
 * header or path segment). The resolver is invoked exactly once per
 * session; follow-up requests carrying the `Mcp-Session-Id` header are
 * routed to the existing `McpServer` + transport pair.
 *
 * Use this for Studio's hosted MCP Cloud or any agent that drives
 * multiple Contentrain projects through a single HTTP endpoint.
 */
export interface HttpMcpServerResolverOptions {
  /**
   * Per-session provider resolver. Invoked on the first request of a
   * new session (typically the MCP `initialize` call). Whatever
   * provider the resolver returns is bound to that session for its
   * lifetime.
   */
  resolveProvider: (req: http.IncomingMessage) => ToolProvider | Promise<ToolProvider>
  /** Optional fallback project root injected into each resolved session. */
  projectRoot?: string
  /** Optional Bearer token — when set, requests must send `Authorization: Bearer <token>`. */
  authToken?: string
  /** Mount path for the MCP JSON-RPC endpoint. Defaults to `/mcp`. */
  path?: string
  /**
   * Idle-session TTL in ms. Sessions that haven't received a request
   * within this window are closed and their providers discarded.
   * Defaults to 15 minutes.
   */
  sessionTtlMs?: number
}

export interface HttpMcpServerHandle {
  server: http.Server
  /**
   * The single shared `McpServer` when the server was started with
   * `{ projectRoot }` or `{ provider }`. **Not set** in multi-tenant
   * resolver mode — in that mode each session owns its own server and
   * you should address them through the HTTP endpoint, not directly.
   */
  mcp: McpServer | null
  url: string
  close: () => Promise<void>
}

const MCP_SESSION_HEADER = 'mcp-session-id'

/**
 * Start an HTTP transport for the MCP server on top of the local project.
 *
 * Stateless, single-endpoint `POST /mcp`. The underlying `McpServer` is
 * the same one the stdio entry point uses, so every tool registered for
 * stdio is available over HTTP with no duplication. Only the transport
 * swaps out.
 *
 * Auth is a simple opaque Bearer token. When `authToken` is supplied,
 * any request without the exact `Authorization: Bearer <token>` header
 * gets a 401 before the MCP transport sees it. Non-local bind addresses
 * should always set this — the `contentrain serve --mcpHttp` CLI hard-
 * errors when it detects a non-localhost bind without a token.
 */
export async function startHttpMcpServer(
  opts: HttpMcpServerOptions & { port: number, host?: string },
): Promise<HttpMcpServerHandle> {
  const mcp = createMcpServer(opts.projectRoot)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  await mcp.connect(transport)

  return startHttpMcpServerInternal({
    mode: 'single',
    mcp,
    transport,
    port: opts.port,
    host: opts.host,
    authToken: opts.authToken,
    path: opts.path,
  })
}

/**
 * Variant accepting a pre-built provider or a per-request resolver.
 *
 * **Single-provider mode** (`{ provider }`):
 * All sessions share one `McpServer` backed by the given provider.
 * Good for CI runners, single-tenant deployments, or any case where
 * the backing repository is fixed at boot time.
 *
 * **Multi-tenant mode** (`{ resolveProvider }`):
 * Each session resolves its own provider from the incoming request.
 * The resolver is invoked once per session; subsequent requests with
 * the `Mcp-Session-Id` header reuse the same server + transport pair.
 * Idle sessions are closed after `sessionTtlMs` (default 15m).
 */
export async function startHttpMcpServerWith(
  opts: (HttpMcpServerProviderOptions | HttpMcpServerResolverOptions) & { port: number, host?: string },
): Promise<HttpMcpServerHandle> {
  if ('resolveProvider' in opts) {
    return startMultiTenantHttpMcpServer(opts)
  }
  const mcp = createMcpServer({ provider: opts.provider, projectRoot: opts.projectRoot })
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  await mcp.connect(transport)
  return startHttpMcpServerInternal({
    mode: 'single',
    mcp,
    transport,
    port: opts.port,
    host: opts.host,
    authToken: opts.authToken,
    path: opts.path,
  })
}

interface MultiTenantSession {
  mcp: McpServer
  transport: StreamableHTTPServerTransport
  lastUsed: number
}

async function startMultiTenantHttpMcpServer(
  opts: HttpMcpServerResolverOptions & { port: number, host?: string },
): Promise<HttpMcpServerHandle> {
  const sessions = new Map<string, MultiTenantSession>()
  const ttl = opts.sessionTtlMs ?? 15 * 60 * 1000
  const mountPath = opts.path ?? '/mcp'
  const host = opts.host ?? '127.0.0.1'

  async function disposeSession(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId)
    if (!session) return
    sessions.delete(sessionId)
    await session.transport.close().catch(() => { /* best-effort */ })
    await session.mcp.close().catch(() => { /* best-effort */ })
  }

  const reaper = setInterval(() => {
    const now = Date.now()
    for (const [id, session] of sessions) {
      if (now - session.lastUsed > ttl) void disposeSession(id)
    }
  }, Math.min(ttl, 60_000)).unref()

  const server = http.createServer((req, res) => {
    void handleMultiTenantRequest(req, res, {
      mountPath,
      authToken: opts.authToken,
      resolveProvider: opts.resolveProvider,
      projectRoot: opts.projectRoot,
      sessions,
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  const url = `http://${host}:${address.port}${mountPath}`

  return {
    server,
    mcp: null,
    url,
    close: async () => {
      clearInterval(reaper)
      await new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()))
      })
      const ids = [...sessions.keys()]
      await Promise.all(ids.map(id => disposeSession(id)))
    },
  }
}

async function handleMultiTenantRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: {
    mountPath: string
    authToken?: string
    resolveProvider: (req: http.IncomingMessage) => ToolProvider | Promise<ToolProvider>
    projectRoot?: string
    sessions: Map<string, MultiTenantSession>
  },
): Promise<void> {
  if (!applyRouteChecks(req, res, { mountPath: ctx.mountPath, authToken: ctx.authToken })) return

  const existingSessionId = pickSessionId(req.headers[MCP_SESSION_HEADER])
  if (existingSessionId && ctx.sessions.has(existingSessionId)) {
    const session = ctx.sessions.get(existingSessionId)!
    session.lastUsed = Date.now()
    try {
      await session.transport.handleRequest(req, res)
    } catch (error) {
      writeInternalError(res, error)
    }
    return
  }

  try {
    const provider = await ctx.resolveProvider(req)
    const mcp = createMcpServer({ provider, projectRoot: ctx.projectRoot })
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        ctx.sessions.set(sessionId, { mcp, transport, lastUsed: Date.now() })
      },
    })
    await mcp.connect(transport)
    await transport.handleRequest(req, res)
  } catch (error) {
    writeInternalError(res, error)
  }
}

function pickSessionId(header: string | string[] | undefined): string | undefined {
  if (!header) return undefined
  return Array.isArray(header) ? header[0] : header
}

function applyRouteChecks(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { mountPath: string, authToken?: string },
): boolean {
  if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
    writeJson(res, 405, { error: 'Method Not Allowed' })
    return false
  }
  if (!req.url || !req.url.startsWith(ctx.mountPath)) {
    writeJson(res, 404, { error: 'Not Found' })
    return false
  }
  if (ctx.authToken) {
    const header = req.headers.authorization
    if (header !== `Bearer ${ctx.authToken}`) {
      writeJson(res, 401, { error: 'Unauthorized' })
      return false
    }
  }
  return true
}

async function startHttpMcpServerInternal(input: {
  mode: 'single'
  mcp: McpServer
  transport: StreamableHTTPServerTransport
  port: number
  host?: string
  authToken?: string
  path?: string
}): Promise<HttpMcpServerHandle> {
  const { mcp, transport } = input
  const mountPath = input.path ?? '/mcp'
  const host = input.host ?? '127.0.0.1'

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, { transport, mountPath, authToken: input.authToken })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(input.port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  const url = `http://${host}:${address.port}${mountPath}`

  return {
    server,
    mcp,
    url,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()))
      })
      await transport.close().catch(() => { /* best-effort */ })
      await mcp.close().catch(() => { /* best-effort */ })
    },
  }
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: { transport: StreamableHTTPServerTransport, mountPath: string, authToken?: string },
): Promise<void> {
  if (!applyRouteChecks(req, res, { mountPath: ctx.mountPath, authToken: ctx.authToken })) return

  try {
    await ctx.transport.handleRequest(req, res)
  } catch (error) {
    writeInternalError(res, error)
  }
}

function writeInternalError(res: http.ServerResponse, error: unknown): void {
  if (res.headersSent) return
  writeJson(res, 500, {
    error: 'Internal Server Error',
    message: error instanceof Error ? error.message : String(error),
  })
}

function writeJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
