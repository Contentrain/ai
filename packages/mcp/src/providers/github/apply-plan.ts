import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type { ApplyPlanInput, Commit, FileChange } from '../../core/contracts/index.js'
import { isNotFoundError, resolveRepoPath } from '../shared/index.js'
import type { GitHubClient } from './client.js'
import type { RepoRef } from './types.js'

// A GitHub Git-tree entry. Writes carry `content` inline (GitHub creates the
// blob as part of createTree); deletions carry `sha: null`. The two are
// mutually exclusive — an entry may set `content` OR `sha`, never both.
type TreeEntry =
  | { path: string, mode: '100644', type: 'blob', content: string }
  | { path: string, mode: '100644', type: 'blob', sha: null }

/**
 * Apply a plan to a GitHub repository as a single atomic commit via the
 * Git Data API. High-level flow:
 *
 * 1. Resolve the base commit SHA — either the current HEAD of the target
 *    branch, or the HEAD of `input.base` (or the repo's default branch)
 *    when the target branch does not yet exist.
 * 2. Read the base tree SHA from that commit.
 * 3. Map `input.changes` to tree entries — `content` inline for each write,
 *    `sha: null` for each deletion. No per-file blob round trip: GitHub
 *    creates the blobs as part of `createTree`, which keeps the write to a
 *    fixed 3 mutations (tree + commit + ref) regardless of file count and
 *    stays under the mutation-rate secondary limit. Mirrors the GitLab
 *    provider, which already inlines content in its commit actions.
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

  const treeEntries = input.changes.map(change => buildTreeEntry(repo, change))

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

function buildTreeEntry(repo: RepoRef, change: FileChange): TreeEntry {
  const path = resolveRepoPath(repo.contentRoot, change.path)
  if (change.content === null) {
    return { path, mode: '100644', type: 'blob', sha: null }
  }
  // Inline UTF-8 content — the write path never produces binary/base64, so
  // there is no blob-encoding branch to preserve. GitHub creates the blob
  // when the tree is created.
  return { path, mode: '100644', type: 'blob', content: change.content }
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

  // Invariant: feature branches always fork from the Contentrain
  // content-tracking branch. Callers that genuinely want to bypass this
  // must pass `base` explicitly. The repository's default branch
  // (main / master / trunk) is NOT the fallback — that would create a
  // split-brain where remote writes derive from a different ref than
  // local writes, which the LocalProvider transaction path forbids.
  const baseRefName = base ?? CONTENTRAIN_BRANCH

  const baseRef = await client.rest.git.getRef({
    owner: repo.owner,
    repo: repo.name,
    ref: `heads/${baseRefName}`,
  })
  return { baseSha: baseRef.data.object.sha, branchExists: false }
}
