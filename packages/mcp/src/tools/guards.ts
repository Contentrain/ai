import type { ContentReadSource, RepoProvider } from '../core/contracts/index.js'

/**
 * Emit a uniform "capability not available" response for tools that
 * require local filesystem access but are being driven by a remote
 * provider (HTTP + GitHubProvider at the moment). The agent can use
 * `capability_required` to decide whether to retry against a different
 * transport or surface the limitation to the user.
 */
export function capabilityError(tool: string, capability: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      error: `${tool} requires local filesystem access.`,
      capability_required: capability,
      hint: 'This tool is unavailable when MCP is driven by a remote provider (e.g. GitHubProvider). Use a LocalProvider or the stdio transport.',
    }) }],
    isError: true as const,
  }
}

/**
 * The content source to report on a read tool's response, or null when the
 * content came from where it always has (#229). Non-null only for a local
 * provider on a feature branch, which reads `.contentrain/` from the
 * `contentrain` ref: tools then read through the provider, not the
 * working-tree fast paths, and say so as `content_source`.
 */
export async function refSource(provider: RepoProvider): Promise<ContentReadSource | null> {
  const source = await provider.contentSource?.()
  return source?.source === 'ref' ? source : null
}
