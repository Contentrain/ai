import type { ProviderCapabilities } from '@contentrain/types'

/**
 * Declarative availability requirements for capability-gated tools.
 *
 * This is the single source of truth `createServer` uses to decide which
 * tools to register for a given provider + projectRoot combination. Tools
 * absent from this map are always available. The requirements mirror the
 * call-time guards inside each tool handler (`capabilityError`) — those
 * guards remain as defense in depth, but a client talking to a remote
 * provider no longer sees tools that could never succeed in `tools/list`.
 *
 * `contentrain_validate` is intentionally NOT listed: read-only validate
 * works over any provider; only `fix: true` needs a local worktree and
 * keeps its call-time guard.
 */
export interface ToolRequirements {
  /** Tool needs a local project root on disk (worktree git transactions, IDE config, AST scans). */
  projectRoot?: boolean
  /** Provider capability flags that must all be `true`. */
  capabilities?: readonly (keyof ProviderCapabilities)[]
  /** Tool needs the provider's optional media facet (`RepoProvider.media`). */
  media?: boolean
}

export const TOOL_REQUIREMENTS: Readonly<Record<string, ToolRequirements>> = {
  contentrain_init: { projectRoot: true },
  contentrain_scaffold: { projectRoot: true },
  contentrain_doctor: { projectRoot: true },
  contentrain_bulk: { projectRoot: true },
  contentrain_submit: { projectRoot: true, capabilities: ['localWorktree', 'pushRemote'] },
  contentrain_merge: { projectRoot: true, capabilities: ['localWorktree'] },
  contentrain_branch_list: { projectRoot: true, capabilities: ['localWorktree'] },
  contentrain_branch_delete: { projectRoot: true, capabilities: ['localWorktree'] },
  contentrain_scan: { projectRoot: true, capabilities: ['astScan'] },
  // Registration requires the extract path (sourceRead); reuse mode
  // additionally needs sourceWrite, which stays a call-time check because
  // it depends on the `mode` input.
  contentrain_apply: { projectRoot: true, capabilities: ['sourceRead'] },
  // Media tools exist only where the provider exposes a media stack
  // (Studio MCP Cloud). Local and plain remote providers never list them.
  contentrain_media_list: { media: true },
  contentrain_media_get: { media: true },
  contentrain_media_ingest: { media: true },
  contentrain_media_update: { media: true },
  contentrain_media_delete: { media: true },
}

/**
 * Whether a tool can ever succeed for this provider + projectRoot pair.
 * Used by `createServer` to filter registration; also exported for
 * embedders (e.g. Studio) that want to reason about the effective tool
 * surface without spinning up a server.
 */
export function isToolAvailable(
  name: string,
  provider: { capabilities: ProviderCapabilities, media?: unknown },
  projectRoot: string | undefined,
): boolean {
  const req = TOOL_REQUIREMENTS[name]
  if (!req) return true
  if (req.projectRoot && !projectRoot) return false
  if (req.media && !provider.media) return false
  return (req.capabilities ?? []).every(cap => provider.capabilities[cap])
}
