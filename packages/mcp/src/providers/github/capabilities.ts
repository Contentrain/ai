import type { ProviderCapabilities } from '../../core/contracts/index.js'

/**
 * Capability set for GitHubProvider.
 *
 * GitHub over the Git Data API has no working tree, so local worktree
 * features, source-file access and AST scans are unavailable. Push /
 * PR operations are free because every commit goes straight to the
 * remote. Branch protection detection uses the Repos API.
 *
 * Tools that require `astScan`, `sourceRead` or `sourceWrite` must
 * gracefully reject (with `capability_required`) when running against
 * a GitHubProvider — this is the mechanism behind phase 6's normalize
 * capability-gate.
 */
export const GITHUB_CAPABILITIES: ProviderCapabilities = {
  localWorktree: false,
  sourceRead: false,
  sourceWrite: false,
  pushRemote: true,
  branchProtection: true,
  pullRequestFallback: true,
  astScan: false,
}
