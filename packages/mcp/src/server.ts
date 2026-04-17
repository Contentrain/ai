import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RepoProvider } from './core/contracts/index.js'
import { LocalProvider } from './providers/local/index.js'

/**
 * The provider shape tool handlers consume. Now that every provider
 * (Local, GitHub, GitLab) implements the full `RepoProvider`, tools can
 * depend on the shared surface directly — no private alias required.
 * Kept as a re-export so callers that already import `ToolProvider` do
 * not need to migrate.
 */
export type ToolProvider = RepoProvider
import { registerContextTools } from './tools/context.js'
import { registerSetupTools } from './tools/setup.js'
import { registerModelTools } from './tools/model.js'
import { registerContentTools } from './tools/content.js'
import { registerWorkflowTools } from './tools/workflow.js'
import { registerNormalizeTools } from './tools/normalize.js'
import { registerBulkTools } from './tools/bulk.js'
import packageJson from '../package.json' with { type: 'json' }

export interface CreateServerOptions {
  /**
   * Content provider — drives reads (and, in later phases, writes) through
   * a reader surface. Required when `projectRoot` is omitted. Accepts the
   * narrow `ToolProvider` shape so either `LocalProvider` or
   * `GitHubProvider` satisfies the contract.
   */
  provider?: ToolProvider
  /**
   * Local project root. When the provider is a `LocalProvider`, its own
   * `projectRoot` is used as the fallback. Tools that require local disk
   * (normalize, setup, git submit/merge) short-circuit with a capability
   * error when no projectRoot is available.
   */
  projectRoot?: string
}

/**
 * Create an MCP server instance with every Contentrain tool registered.
 *
 * Two signatures:
 *
 * - `createServer('/path/to/project')` — legacy stdio flow. A `LocalProvider`
 *   is constructed under the hood; every tool keeps behaving exactly as it
 *   did before phase 5.3.
 * - `createServer({ provider, projectRoot? })` — phase 5.3 flow. Any
 *   `RepoProvider` (including `GitHubProvider`) drives reads and writes. If
 *   the provider is a `LocalProvider` and `projectRoot` is omitted, the
 *   provider's own `projectRoot` is used. Otherwise `projectRoot` stays
 *   undefined and tools that need local disk report a capability error.
 *
 * Public MCP tool surface (names, parameters, response JSON shape) is
 * unchanged across both signatures.
 */
export function createServer(projectRoot: string): McpServer
export function createServer(opts: CreateServerOptions): McpServer
export function createServer(input: string | CreateServerOptions): McpServer {
  const { provider, projectRoot } = resolveServerContext(input)

  const server = new McpServer({
    name: 'contentrain-mcp',
    version: packageJson.version,
  })

  registerContextTools(server, provider, projectRoot)
  registerSetupTools(server, provider, projectRoot)
  registerModelTools(server, provider, projectRoot)
  registerContentTools(server, provider, projectRoot)
  registerWorkflowTools(server, provider, projectRoot)
  registerNormalizeTools(server, provider, projectRoot)
  registerBulkTools(server, provider, projectRoot)

  return server
}

function resolveServerContext(input: string | CreateServerOptions): {
  provider: ToolProvider
  projectRoot: string | undefined
} {
  if (typeof input === 'string') {
    return { provider: new LocalProvider(input), projectRoot: input }
  }
  if (input.provider) {
    let projectRoot = input.projectRoot
    if (!projectRoot && input.provider instanceof LocalProvider) {
      projectRoot = input.provider.projectRoot
    }
    return { provider: input.provider, projectRoot }
  }
  if (input.projectRoot) {
    return { provider: new LocalProvider(input.projectRoot), projectRoot: input.projectRoot }
  }
  throw new Error('createServer: either `provider` or `projectRoot` must be provided')
}
