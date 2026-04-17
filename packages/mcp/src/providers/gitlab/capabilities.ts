import type { ProviderCapabilities } from '../../core/contracts/index.js'

/**
 * Capability set for GitLabProvider.
 *
 * GitLab over REST has no working tree, so local worktree features,
 * source-file access and AST scans are unavailable. Push, merge and
 * branch-protection detection all work over the API. GitLab enforces
 * merges through merge requests, so `pullRequestFallback` is `true` —
 * `mergeBranch` opens an MR and auto-accepts it to match GitHub's
 * `repos.merge` semantics while still leaving an audit trail.
 */
export const GITLAB_CAPABILITIES: ProviderCapabilities = {
  localWorktree: false,
  sourceRead: false,
  sourceWrite: false,
  pushRemote: true,
  branchProtection: true,
  pullRequestFallback: true,
  astScan: false,
}
