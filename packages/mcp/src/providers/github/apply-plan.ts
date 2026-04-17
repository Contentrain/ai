import type { ApplyPlanInput, Commit, FileChange } from '../../core/contracts/index.js'
import { isNotFoundError, resolveRepoPath } from '../shared/index.js'
import type { GitHubClient } from './client.js'
import type { RepoRef } from './types.js'

interface TreeEntry {
  path: string
  mode: '100644' | '100755' | '040000' | '160000' | '120000'
  type: 'blob' | 'tree' | 'commit'
  sha: string | null
}

/**
 * Apply a plan to a GitHub repository as a single atomic commit via the
 * Git Data API. High-level flow:
 *
 * 1. Resolve the base commit SHA — either the current HEAD of the target
 *    branch, or the HEAD of `input.base` (or the repo's default branch)
 *    when the target branch does not yet exist.
 * 2. Read the base tree SHA from that commit.
 * 3. Walk `input.changes` in parallel — create a blob per non-null
 *    content, emit a tree entry with `sha: null` for each deletion.
 * 4. Create a new tree layered on top of the base tree with the collected
 *    entries.
 * 5. Create the commit (tree, parents, author).
 * 6. Update an existing branch ref or create a new one pointing at the
 *    commit.
 *
 * No working tree, no transaction — the commit is durable as soon as the
 * final ref update returns.
 */
export async function applyPlanToGitHub(
  client: GitHubClient,
  repo: RepoRef,
  input: ApplyPlanInput,
): Promise<Commit> {
  const { baseSha, branchExists } = await resolveBaseSha(client, repo, input.branch, input.base)

  const baseCommit = await client.rest.git.getCommit({
    owner: repo.owner,
    repo: repo.name,
    commit_sha: baseSha,
  })
  const baseTreeSha = baseCommit.data.tree.sha

  const treeEntries = await Promise.all(
    input.changes.map(change => buildTreeEntry(client, repo, change)),
  )

  const tree = await client.rest.git.createTree({
    owner: repo.owner,
    repo: repo.name,
    base_tree: baseTreeSha,
    tree: treeEntries,
  })

  const timestamp = new Date().toISOString()
  const commit = await client.rest.git.createCommit({
    owner: repo.owner,
    repo: repo.name,
    message: input.message,
    tree: tree.data.sha,
    parents: [baseSha],
    author: {
      name: input.author.name,
      email: input.author.email,
      date: timestamp,
    },
  })

  if (branchExists) {
    await client.rest.git.updateRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${input.branch}`,
      sha: commit.data.sha,
    })
  } else {
    await client.rest.git.createRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `refs/heads/${input.branch}`,
      sha: commit.data.sha,
    })
  }

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

async function buildTreeEntry(
  client: GitHubClient,
  repo: RepoRef,
  change: FileChange,
): Promise<TreeEntry> {
  const path = resolveRepoPath(repo.contentRoot, change.path)
  if (change.content === null) {
    return { path, mode: '100644', type: 'blob', sha: null }
  }
  const blob = await client.rest.git.createBlob({
    owner: repo.owner,
    repo: repo.name,
    content: change.content,
    encoding: 'utf-8',
  })
  return { path, mode: '100644', type: 'blob', sha: blob.data.sha }
}

async function resolveBaseSha(
  client: GitHubClient,
  repo: RepoRef,
  branch: string,
  base: string | undefined,
): Promise<{ baseSha: string, branchExists: boolean }> {
  try {
    const ref = await client.rest.git.getRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${branch}`,
    })
    return { baseSha: ref.data.object.sha, branchExists: true }
  } catch (error) {
    if (!isNotFoundError(error)) throw error
  }

  const baseRefName = base ?? (await client.rest.repos.get({
    owner: repo.owner,
    repo: repo.name,
  })).data.default_branch

  const baseRef = await client.rest.git.getRef({
    owner: repo.owner,
    repo: repo.name,
    ref: `heads/${baseRefName}`,
  })
  return { baseSha: baseRef.data.object.sha, branchExists: false }
}
