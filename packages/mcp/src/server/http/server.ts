import http from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer as createMcpServer } from '../../server.js'

export interface HttpMcpServerOptions {
  /** Project root the MCP server operates against (LocalProvider path). */
  projectRoot: string
  /** Optional Bearer token — when set, requests must send `Authorization: Bearer <token>`. */
  authToken?: string
  /** Mount path for the MCP JSON-RPC endpoint. Defaults to `/mcp`. */
  path?: string
}

export interface HttpMcpServerHandle {
  server: http.Server
  mcp: McpServer
  url: string
  close: () => Promise<void>
}

/**
 * Start an HTTP transport for the MCP server on top of the local project.
 *
 * Phase 5.2 scope: stateless, single-endpoint `POST /mcp`. The underlying
 * McpServer is the same one the stdio entry point uses, so every tool
 * registered for stdio is available over HTTP with no duplication. Only
 * the transport swaps out.
 *
 * Auth is a simple opaque Bearer token. When `authToken` is supplied, any
 * request without the exact `Authorization: Bearer <token>` header gets
 * a 401 before the MCP transport sees it. Multi-tenant auth (per-project
 * API keys, GitHub App scopes) is Studio's concern — MCP stays minimal.
 *
 * GitHubProvider HTTP routing will land in phase 5.3 together with the
 * tool-handler provider abstraction; today the HTTP server still drives
 * a LocalProvider under the hood.
 */
export async function startHttpMcpServer(
  opts: HttpMcpServerOptions & { port: number, host?: string },
): Promise<HttpMcpServerHandle> {
  const mcp = createMcpServer(opts.projectRoot)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  })
  await mcp.connect(transport)

  const mountPath = opts.path ?? '/mcp'
  const host = opts.host ?? '127.0.0.1'

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, { transport, mountPath, authToken: opts.authToken })
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
  if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
    writeJson(res, 405, { error: 'Method Not Allowed' })
    return
  }

  if (!req.url || !req.url.startsWith(ctx.mountPath)) {
    writeJson(res, 404, { error: 'Not Found' })
    return
  }

  if (ctx.authToken) {
    const header = req.headers.authorization
    if (header !== `Bearer ${ctx.authToken}`) {
      writeJson(res, 401, { error: 'Unauthorized' })
      return
    }
  }

  try {
    await ctx.transport.handleRequest(req, res)
  } catch (error) {
    if (!res.headersSent) {
      writeJson(res, 500, {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function writeJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
