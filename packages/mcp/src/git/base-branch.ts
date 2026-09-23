import type { SimpleGit } from 'simple-git'
import type { ContentrainConfig } from '@contentrain/types'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'

/**
 * Resolve the base branch — the branch a local auto-merge advances with
 * `update-ref`, pushes, and merges into `contentrain` before every write.
 *
 * Precedence, the same at every call site:
 *   1. `CONTENTRAIN_BRANCH` env — a per-process override;
 *   2. `config.repository.default_branch`;
 *   3. the remote's default (`refs/remotes/<remote>/HEAD`), when that branch
 *      exists locally;
 *   4. a local `main`, then a local `master`;
 *   5. the checked-out branch — only when none of the above exists;
 *   6. `'main'`.
 *
 * The checked-out branch used to be step 3. That made a developer's feature
 * branch the base of every content write run while it was checked out: its
 * code commits were merged into `contentrain`, the feature branch itself was
 * advanced and pushed, and the code reached the real default branch on the
 * next write by anyone else (#227). The checked-out branch is where the
 * developer happens to be, not where content belongs.
 *
 * `currentBranch` may be passed when the caller already has it, to save a
 * spawn; it is only consulted as the last resort.
 */
export async function resolveBaseBranch(
  git: SimpleGit,
  config: ContentrainConfig | null | undefined,
  options: { remoteName?: string, currentBranch?: string } = {},
): Promise<string> {
  const fromEnv = process.env['CONTENTRAIN_BRANCH']?.trim()
  if (fromEnv) return fromEnv
  const fromConfig = config?.repository?.default_branch?.trim()
  if (fromConfig) return fromConfig

  const remoteName = options.remoteName ?? process.env['CONTENTRAIN_REMOTE'] ?? 'origin'
  const remoteHead = `refs/remotes/${remoteName}/HEAD`

  // One spawn answers "which of main/master exist" and "where does the
  // remote HEAD point". for-each-ref prints nothing for a missing pattern.
  const refs = new Map<string, string>()
  try {
    const raw = await git.raw([
      'for-each-ref', '--format=%(refname) %(symref)',
      'refs/heads/main', 'refs/heads/master', remoteHead,
    ])
    for (const line of raw.split('\n')) {
      const [name, symref = ''] = line.trim().split(' ')
      if (name) refs.set(name, symref)
    }
  } catch {
    // Not a repository or no refs yet — fall through to the checked-out branch.
  }

  const remoteDefault = refs.get(remoteHead)?.replace(`refs/remotes/${remoteName}/`, '')
  if (remoteDefault && remoteDefault !== CONTENTRAIN_BRANCH && await localBranchExists(git, remoteDefault, refs)) {
    return remoteDefault
  }
  if (refs.has('refs/heads/main')) return 'main'
  if (refs.has('refs/heads/master')) return 'master'

  const current = options.currentBranch
    ?? (await git.raw(['branch', '--show-current']).catch(() => '')).trim()
  if (current && current !== CONTENTRAIN_BRANCH) return current
  return 'main'
}

async function localBranchExists(git: SimpleGit, branch: string, known: Map<string, string>): Promise<boolean> {
  if (known.has(`refs/heads/${branch}`)) return true
  try {
    return (await git.raw(['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`])).trim() !== ''
  } catch {
    return false
  }
}
