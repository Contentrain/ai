import { simpleGit } from 'simple-git'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../core/config.js'
import { branchTimestamp } from '../util/id.js'

export interface GitTransaction {
  worktree: string
  branch: string
  write(callback: (worktreePath: string) => Promise<void>): Promise<void>
  commit(message: string): Promise<string>
  complete(): Promise<{ action: 'auto-merged' | 'pending-review'; commit: string }>
  cleanup(): Promise<void>
}

export async function createTransaction(
  projectRoot: string,
  branchName: string,
): Promise<GitTransaction> {
  const git = simpleGit(projectRoot)
  const config = await readConfig(projectRoot)
  const workflow = config?.workflow ?? 'auto-merge'

  const remoteName = process.env['CONTENTRAIN_REMOTE'] ?? 'origin'
  const baseBranch = process.env['CONTENTRAIN_BRANCH'] ?? config?.repository?.default_branch ?? 'main'

  // Detect remote
  let hasRemote = false
  try {
    const remotes = await git.getRemotes()
    hasRemote = remotes.some(r => r.name === remoteName)
  } catch {
    hasRemote = false
  }

  // Fetch latest if remote exists
  if (hasRemote) {
    try {
      await git.fetch(remoteName, baseBranch)
    } catch {
      // fetch may fail (no network), continue with local state
    }
  }

  const worktreePath = join(tmpdir(), `cr-${randomUUID()}`)
  const branch = branchName

  // Create worktree with new branch from base
  const baseRef = hasRemote ? `${remoteName}/${baseBranch}` : baseBranch
  await git.raw(['worktree', 'add', worktreePath, '-b', branch, baseRef])

  const wtGit = simpleGit(worktreePath)

  // Configure author
  const authorName = process.env['CONTENTRAIN_AUTHOR_NAME'] ?? 'Contentrain'
  const authorEmail = process.env['CONTENTRAIN_AUTHOR_EMAIL'] ?? 'mcp@contentrain.io'
  await wtGit.addConfig('user.name', authorName)
  await wtGit.addConfig('user.email', authorEmail)

  let commitHash = ''

  return {
    worktree: worktreePath,
    branch,

    async write(callback) {
      await callback(worktreePath)
    },

    async commit(message) {
      await wtGit.add('.')
      const result = await wtGit.commit(message)
      commitHash = result.commit || ''
      return commitHash
    },

    async complete() {
      if (workflow === 'review') {
        if (hasRemote) {
          await git.push(remoteName, branch)
        }
        return { action: 'pending-review', commit: commitHash }
      }

      // auto-merge: merge branch into base
      if (hasRemote) {
        try {
          await git.fetch(remoteName, baseBranch)
        } catch {
          // continue with local state
        }
      }
      await git.checkout(baseBranch)
      await git.merge([branch])

      if (hasRemote) {
        try {
          await git.push(remoteName, baseBranch)
        } catch {
          // push may fail, branch is merged locally
        }
      }

      return { action: 'auto-merged', commit: commitHash }
    },

    async cleanup() {
      try {
        await git.raw(['worktree', 'remove', worktreePath, '--force'])
      } catch {
        // worktree may already be cleaned up
      }
    },
  }
}

export function buildBranchName(scope: string, target: string, locale?: string): string {
  const ts = branchTimestamp()
  const parts = ['contentrain', scope, target]
  if (locale) parts.push(locale)
  parts.push(ts)
  return parts.join('/')
}
