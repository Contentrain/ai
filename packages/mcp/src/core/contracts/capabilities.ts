/**
 * Capabilities describe what a provider can and cannot do. Operations check
 * required capabilities before running. Normalize extract needs `sourceRead`;
 * normalize reuse needs `sourceWrite`; submit needs `pushRemote`; AST scans
 * need `astScan` (which implies a local working tree).
 *
 * The consistent position is: all git hosts are commodity MIT providers; the
 * distinction between providers is operational (how they read/write), not
 * commercial. Enterprise features live in Studio, not in capability gates.
 */
export interface ProviderCapabilities {
  /** Provider backs onto a local worktree and can selectively sync changes into the developer's working tree. */
  localWorktree: boolean
  /** Provider can read arbitrary source files outside `.contentrain/`. Required for normalize extract. */
  sourceRead: boolean
  /** Provider can write arbitrary source files outside `.contentrain/`. Required for normalize reuse. */
  sourceWrite: boolean
  /** Provider can push commits to a remote. Required for submit. */
  pushRemote: boolean
  /** Provider detects branch protection rules on the remote. */
  branchProtection: boolean
  /** Provider can open a pull request as a merge fallback when branch protection blocks direct merge. */
  pullRequestFallback: boolean
  /** Provider can execute AST scanners against source files. Implies local disk access. */
  astScan: boolean
}

/** Capability set for the LocalProvider (simple-git + worktree). */
export const LOCAL_CAPABILITIES: ProviderCapabilities = {
  localWorktree: true,
  sourceRead: true,
  sourceWrite: true,
  pushRemote: true,
  branchProtection: false,
  pullRequestFallback: false,
  astScan: true,
}
