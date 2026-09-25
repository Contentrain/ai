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
  return (await resolveBaseBranchSource(git, config, options)).branch
}

/** Which rung of {@link resolveBaseBranch}'s precedence answered. */
export type BaseBranchSource = 'env' | 'config' | 'remote_head' | 'main' | 'master' | 'checked_out' | 'fallback'

/**
 * {@link resolveBaseBranch}, also saying where the answer came from.
 * `env: false` skips the `CONTENTRAIN_BRANCH` override — for callers that
 * record the result, where a per-process override must not become config.
 */
export async function resolveBaseBranchSource(
  git: SimpleGit,
  config: ContentrainConfig | null | undefined,
  options: { remoteName?: string, currentBranch?: string, env?: boolean } = {},
): Promise<{ branch: string, source: BaseBranchSource }> {
  const fromEnv = options.env === false ? undefined : process.env['CONTENTRAIN_BRANCH']?.trim()
  if (fromEnv) return { branch: fromEnv, source: 'env' }
  const fromConfig = config?.repository?.default_branch?.trim()
  if (fromConfig) return { branch: fromConfig, source: 'config' }

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
    return { branch: remoteDefault, source: 'remote_head' }
  }
  if (refs.has('refs/heads/main')) return { branch: 'main', source: 'main' }
  if (refs.has('refs/heads/master')) return { branch: 'master', source: 'master' }

  const current = options.currentBranch
    ?? (await git.raw(['branch', '--show-current']).catch(() => '')).trim()
  if (current && current !== CONTENTRAIN_BRANCH) return { branch: current, source: 'checked_out' }
  return { branch: 'main', source: 'fallback' }
}

/**
 * The branch `init` records as `repository.default_branch`, or `null` when it
 * cannot be told apart from where the developer happens to be (#230).
 *
 * The same precedence as {@link resolveBaseBranch}, minus the env override (a
 * per-process override is not the project's default). The checked-out branch
 * is recorded only when it is the repository's only branch — a fresh
 * `git init` on a host whose `init.defaultBranch` is `develop`/`trunk`.
 * Anywhere else it may be a feature branch, and recording that would make
 * every later write advance it; leaving the field out keeps inference.
 */
export async function resolveInitDefaultBranch(git: SimpleGit): Promise<string | null> {
  const { branch, source } = await resolveBaseBranchSource(git, null, { env: false })
  if (source === 'remote_head' || source === 'main' || source === 'master') return branch
  if (source !== 'checked_out') return null
  const heads = (await git.raw(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).catch(() => ''))
    .split('\n').map(line => line.trim()).filter(name => name && name !== CONTENTRAIN_BRANCH)
  return heads.length === 1 && heads[0] === branch ? branch : null
}

async function localBranchExists(git: SimpleGit, branch: string, known: Map<string, string>): Promise<boolean> {
  if (known.has(`refs/heads/${branch}`)) return true
  try {
    return (await git.raw(['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`])).trim() !== ''
  } catch {
    return false
  }
}
