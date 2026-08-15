import type { Commit, CommitAuthor, FileChange } from '../../core/contracts/index.js'
import { resolveRepoPath } from '../shared/index.js'
import type { GitHubClient } from './client.js'
import type { RepoRef } from './types.js'

type TreeEntry =
  | { path: string, mode: '100644', type: 'blob', content: string }
  | { path: string, mode: '100644', type: 'blob', sha: null }

/**
 * Merge-base of two refs via the compare API — one call answers both the
 * health question ("how far apart are they?") and the reconcile input
 * ("where do the three trees meet?").
 */
export async function getMergeBase(
  client: GitHubClient,
  repo: RepoRef,
  refA: string,
  refB: string,
): Promise<string | null> {
  try {
    const compare = await client.rest.repos.compareCommitsWithBasehead({
      owner: repo.owner,
      repo: repo.name,
      basehead: `${refA}...${refB}`,
    })
    return compare.data.merge_base_commit?.sha ?? null
  } catch {
    return null
  }
}

/**
 * Two-parent merge commit via the Git Data API: tree layered on OURS'
 * tree, `parents: [ours, theirs]`, ref advanced. After it, `theirs` is an
 * ancestor of the branch and a plain fast-forward advance works again.
 *
 * IMPORTANT — the caller composes the COMPLETE tree delta versus ours.
 * The planner only owns content paths; a path that changed on theirs only
 * (source code from the base branch) must be included by the caller, or
 * the merge commit's tree would silently revert it. The compare API gives
 * both file lists; Studio's orchestrator owns that composition.
 */
export async function createMergeCommit(
  client: GitHubClient,
  repo: RepoRef,
  input: {
    branch: string
    ours: string
    theirs: string
    changes: FileChange[]
    message: string
    author: CommitAuthor
  },
): Promise<Commit> {
  const ref = await client.rest.git.getRef({
    owner: repo.owner,
    repo: repo.name,
    ref: `heads/${input.branch}`,
  })
  if (ref.data.object.sha !== input.ours) {
    throw Object.assign(new Error(
      `createMergeCommit: "${input.branch}" is at ${ref.data.object.sha.slice(0, 8)}, not the expected ${input.ours.slice(0, 8)} — the branch moved since planning.`,
    ), {
      code: 'RECONCILE_STALE_OURS',
      agent_hint: 'Re-run the reconcile plan against the current tip.',
    })
  }

  const oursCommit = await client.rest.git.getCommit({
    owner: repo.owner,
    repo: repo.name,
    commit_sha: input.ours,
  })

  const treeEntries: TreeEntry[] = input.changes.map((change) => {
    const path = resolveRepoPath(repo.contentRoot, change.path)
    return change.content === null
      ? { path, mode: '100644', type: 'blob', sha: null }
      : { path, mode: '100644', type: 'blob', content: change.content }
  })

  const tree = treeEntries.length > 0
    ? await client.rest.git.createTree({
        owner: repo.owner,
        repo: repo.name,
        base_tree: oursCommit.data.tree.sha,
        tree: treeEntries,
      })
    : { data: { sha: oursCommit.data.tree.sha } }

  const timestamp = new Date().toISOString()
  const commit = await client.rest.git.createCommit({
    owner: repo.owner,
    repo: repo.name,
    message: input.message,
    tree: tree.data.sha,
    parents: [input.ours, input.theirs],
    author: {
      name: input.author.name,
      email: input.author.email,
      date: timestamp,
    },
  })

  await client.rest.git.updateRef({
    owner: repo.owner,
    repo: repo.name,
    ref: `heads/${input.branch}`,
    sha: commit.data.sha,
  })

  return {
    sha: commit.data.sha,
    message: commit.data.message,
    author: {
      name: commit.data.author?.name ?? input.author.name,
      email: commit.data.author?.email ?? input.author.email,
    },
    timestamp: commit.data.author?.date ?? timestamp,
  }
}
