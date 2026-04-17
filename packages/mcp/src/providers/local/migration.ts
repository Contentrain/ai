import type { SimpleGit } from 'simple-git'

/**
 * Migration: the first MCP release used `contentrain/*` feature branches.
 * Once we introduced the singleton `contentrain` branch (tracking the
 * committed content state), those old feature branches became a ref-
 * namespace conflict — git cannot hold both `contentrain` (a leaf ref)
 * and `contentrain/foo` (implying a directory) simultaneously.
 *
 * `migrateLegacyBranches` removes the old-prefix branches so the
 * singleton `contentrain` ref can be created. It is idempotent and
 * safe to call before every `ensureContentBranch` run.
 *
 * Strategy:
 * 1. Delete merged `contentrain/*` branches first (`-d`). Their commits
 *    are already on the base branch via the old auto-merge flow.
 * 2. Force-delete whatever remains (`-D`). Any unmerged leftover is
 *    from an abandoned or partially-committed legacy branch — content
 *    on `main` always wins, and the singleton `contentrain` branch is
 *    about to be created from `main`/`baseBranch` anyway.
 *
 * Returns the number of branches that were deleted. Callers may log it;
 * the git transaction layer does not need the count for correctness.
 */
export async function migrateLegacyBranches(
  git: SimpleGit,
  baseBranch: string,
): Promise<number> {
  const branches = await git.branchLocal()
  const oldPrefixBranches = branches.all.filter(b => b.startsWith('contentrain/'))
  if (oldPrefixBranches.length === 0) return 0

  let deleted = 0

  // 1) Delete merged legacy branches first — the safe path.
  let mergedLegacy: string[] = []
  try {
    const mergedOutput = await git.raw(['branch', '--merged', baseBranch])
    mergedLegacy = mergedOutput.split('\n')
      .map(b => b.trim().replace(/^\*\s*/, ''))
      .filter(b => b.startsWith('contentrain/'))
  } catch {
    // `branch --merged` fails before baseBranch exists — fall through.
  }

  for (const b of mergedLegacy) {
    try {
      await git.raw(['branch', '-d', b])
      deleted++
    } catch {
      // Branch may be protected or already gone — safe to skip.
    }
  }

  // 2) Force-delete any unmerged legacy branches still present.
  const remaining = (await git.branchLocal()).all.filter(b => b.startsWith('contentrain/'))
  for (const b of remaining) {
    try {
      await git.raw(['branch', '-D', b])
      deleted++
    } catch {
      // Skip — best-effort cleanup.
    }
  }

  return deleted
}
