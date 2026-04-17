import { createServer as createMcpServer } from '@contentrain/mcp/server'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'

/**
 * Thin in-memory MCP client used by CLI commands that front MCP tools
 * (merge, describe, describe-format, scaffold). The `contentrain serve`
 * HTTP API already uses the same transport directly; this helper just
 * isolates the setup/teardown dance so each one-shot command does not
 * have to repeat it.
 */
export interface MCPCallOptions {
  /** Throw when the tool response has `isError: true`. Default: true. */
  throwOnError?: boolean
}

export interface MCPSession {
  /** Invoke a tool by name. Returns the parsed JSON payload from its first text content. */
  call: <T = unknown>(name: string, args?: Record<string, unknown>, options?: MCPCallOptions) => Promise<T>
  /** Tear down the linked transport pair. Always await in a `finally`. */
  close: () => Promise<void>
}

/**
 * Start an in-memory MCP session against a local project root. Always
 * `await session.close()` — typically in a `finally` block — so the
 * underlying transports release cleanly.
 */
export async function openMcpSession(projectRoot: string): Promise<MCPSession> {
  const server = createMcpServer(projectRoot)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'contentrain-cli', version: '1.0.0' })

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ])

  return {
    async call<T = unknown>(
      name: string,
      args: Record<string, unknown> = {},
      options: MCPCallOptions = {},
    ): Promise<T> {
      const result = await client.callTool({ name, arguments: args })
      const contentArr = (result.content ?? []) as Array<{ type: string, text?: string }>
      const textContent = contentArr.find(c => c.type === 'text')
      if (!textContent || typeof textContent.text !== 'string') {
        throw new Error(`Tool ${name} returned no text content`)
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(textContent.text)
      } catch {
        parsed = textContent.text
      }
      if (result.isError && options.throwOnError !== false) {
        const msg = typeof parsed === 'object' && parsed !== null && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : textContent.text
        throw new Error(msg)
      }
      return parsed as T
    },
    async close() {
      await Promise.all([
        client.close().catch(() => {}),
        server.close().catch(() => {}),
      ])
    },
  }
}
