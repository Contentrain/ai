import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RepoProvider } from './core/contracts/index.js'
import { LocalProvider } from './providers/local/index.js'
import { isToolAvailable, TOOL_REQUIREMENTS } from './tools/availability.js'

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
import { registerDoctorTools } from './tools/doctor.js'
import { registerMediaTools } from './tools/media.js'
import packageJson from '../package.json' with { type: 'json' }

/**
 * Default MCP `instructions` surfaced to clients at initialize time.
 * Deliberately kept under 512 characters — directory listings and client
 * UIs truncate longer strings. Override via `CreateServerOptions.instructions`.
 */
export const DEFAULT_INSTRUCTIONS
  = 'Contentrain is git-native content governance: models define structure; '
    + 'content is canonical JSON/Markdown on a dedicated branch. Call '
    + 'contentrain_describe_format before creating models or content. Preview '
    + 'writes with dry_run:true, review the plan, then re-run with '
    + 'dry_run:false. Start with contentrain_status for models, locales, and '
    + 'workflow; inspect a model with contentrain_describe before editing its '
    + 'entries. Tools are deterministic infrastructure — content decisions '
    + 'stay with the agent.'

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
   * (normalize, setup, git submit/merge) are not registered when no
   * projectRoot is available.
   */
  projectRoot?: string
  /**
   * MCP `instructions` string sent to clients in the `initialize` response.
   * Defaults to `DEFAULT_INSTRUCTIONS`; pass an empty string to omit
   * instructions entirely.
   */
  instructions?: string
}

/**
 * `McpServer` variant that silently skips registration for tools named in
 * `skipTools`. Register functions call `server.tool(...)` unconditionally;
 * this subclass is what keeps capability-gated tools out of `tools/list`
 * when the provider (or missing projectRoot) could never satisfy them.
 */
class CapabilityFilteredMcpServer extends McpServer {
  private readonly _skipTools: ReadonlySet<string>

  constructor(
    serverInfo: ConstructorParameters<typeof McpServer>[0],
    options: ConstructorParameters<typeof McpServer>[1],
    skipTools: ReadonlySet<string>,
  ) {
    super(serverInfo, options)
    this._skipTools = skipTools
  }

  // McpServer.tool has six overloads; a rest-args override is the only
  // signature that satisfies all of them. Skipped tools return undefined —
  // register functions discard the handle, so nothing downstream observes it.
  override tool(...args: unknown[]): ReturnType<McpServer['tool']> {
    if (this._skipTools.has(args[0] as string)) {
      return undefined as unknown as ReturnType<McpServer['tool']>
    }
    return (McpServer.prototype.tool as (...toolArgs: unknown[]) => ReturnType<McpServer['tool']>).apply(this, args)
  }
}

/**
 * Create an MCP server instance with every *available* Contentrain tool
 * registered.
 *
 * Two signatures:
 *
 * - `createServer('/path/to/project')` — legacy stdio flow. A `LocalProvider`
 *   is constructed under the hood; every tool keeps behaving exactly as it
 *   did before phase 5.3.
 * - `createServer({ provider, projectRoot? })` — phase 5.3 flow. Any
 *   `RepoProvider` (including `GitHubProvider`) drives reads and writes. If
 *   the provider is a `LocalProvider` and `projectRoot` is omitted, the
 *   provider's own `projectRoot` is used.
 *
 * Tool listing is capability-aware: tools whose requirements
 * (`TOOL_REQUIREMENTS`) cannot be met by the resolved provider +
 * projectRoot pair are not registered, so `tools/list` only advertises
 * tools that can actually succeed. With a `LocalProvider` (stdio and CLI
 * flows) all 19 tools remain registered — behavior there is unchanged.
 */
export function createServer(projectRoot: string): McpServer
export function createServer(opts: CreateServerOptions): McpServer
export function createServer(input: string | CreateServerOptions): McpServer {
  const { provider, projectRoot, instructions } = resolveServerContext(input)

  const skipTools = new Set(
    Object.keys(TOOL_REQUIREMENTS).filter(name => !isToolAvailable(name, provider, projectRoot)),
  )

  const server = new CapabilityFilteredMcpServer(
    {
      name: 'contentrain-mcp',
      version: packageJson.version,
    },
    { instructions: instructions || undefined },
    skipTools,
  )

  registerContextTools(server, provider, projectRoot)
  registerSetupTools(server, provider, projectRoot)
  registerModelTools(server, provider, projectRoot)
  registerContentTools(server, provider, projectRoot)
  registerWorkflowTools(server, provider, projectRoot)
  registerNormalizeTools(server, provider, projectRoot)
  registerBulkTools(server, provider, projectRoot)
  registerDoctorTools(server, provider, projectRoot)
  registerMediaTools(server, provider, projectRoot)

  return server
}

function resolveServerContext(input: string | CreateServerOptions): {
  provider: ToolProvider
  projectRoot: string | undefined
  instructions: string
} {
  if (typeof input === 'string') {
    return { provider: new LocalProvider(input), projectRoot: input, instructions: DEFAULT_INSTRUCTIONS }
  }
  const instructions = input.instructions ?? DEFAULT_INSTRUCTIONS
  if (input.provider) {
    let projectRoot = input.projectRoot
    if (!projectRoot && input.provider instanceof LocalProvider) {
      projectRoot = input.provider.projectRoot
    }
    return { provider: input.provider, projectRoot, instructions }
  }
  if (input.projectRoot) {
    return { provider: new LocalProvider(input.projectRoot), projectRoot: input.projectRoot, instructions }
  }
  throw new Error('createServer: either `provider` or `projectRoot` must be provided')
}
