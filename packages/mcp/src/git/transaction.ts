import { simpleGit } from 'simple-git'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../core/config.js'
import { writeContext } from '../core/context.js'
import { branchTimestamp } from '../util/id.js'

export interface ContextUpdate {
  tool: string
  model: string
  locale?: string
  entries?: string[]
}

export interface GitTransaction {
  worktree: string
  branch: string
  write(callback: (worktreePath: string) => Promise<void>): Promise<void>
  commit(message: string): Promise<string>
  complete(contextUpdate?: ContextUpdate): Promise<{ action: 'auto-merged' | 'pending-review'; commit: string; warning?: string }>
  cleanup(): Promise<void>
}

export async function createTransaction(
  projectRoot: string,
  branchName: string,
  options?: { workflowOverride?: 'review' | 'auto-merge' },
): Promise<GitTransaction> {
  const git = simpleGit(projectRoot)
  const config = await readConfig(projectRoot)
  const workflow = options?.workflowOverride ?? config?.workflow ?? 'auto-merge'

  const remoteName = process.env['CONTENTRAIN_REMOTE'] ?? 'origin'

  // Smart base branch detection: env → config → current branch → 'main'
  let baseBranch = process.env['CONTENTRAIN_BRANCH'] ?? config?.repository?.default_branch ?? ''
  if (!baseBranch) {
    try {
      baseBranch = (await git.raw(['branch', '--show-current'])).trim()
    } catch {
      // fallback below
    }
  }
  if (!baseBranch) {
    baseBranch = 'main'
  }

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
      // Exclude context.json from branch commits — it contains timestamps
      // that cause merge conflicts on sequential operations. Context is
      // updated separately on the base branch after merge.
      try {
        await wtGit.raw(['reset', 'HEAD', '--', '.contentrain/context.json'])
      } catch {
        // context.json may not be staged — that's fine
      }
      const result = await wtGit.commit(message, { '--allow-empty': null })
      commitHash = result.commit || ''
      return commitHash
    },

    async complete(contextUpdate?: ContextUpdate) {
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

      // Stash dirty working tree so checkout + merge can proceed.
      // MCP writes to .contentrain/ while the developer works in src/ —
      // stash pop conflicts are extremely unlikely.
      const status = await git.status()
      const needsStash = status.files.length > 0
      if (needsStash) {
        await git.stash(['push', '--include-untracked', '-m', 'contentrain-auto-stash'])
      }

      let stashPopFailed = false
      try {
        await git.checkout(baseBranch)

        try {
          await git.merge([branch, '--no-edit'])
        } catch {
          // Merge conflict — abort and let the user resolve manually.
          try {
            await git.merge(['--abort'])
          } catch {
            // abort may fail if not in merge state
          }
          throw new Error(
            `Merge conflict when merging branch "${branch}" into "${baseBranch}". `
            + `The branch still exists with your changes intact. `
            + `Resolve the conflict manually, or delete the branch and retry.`,
          )
        }

        if (hasRemote) {
          try {
            await git.push(remoteName, baseBranch)
          } catch {
            // push may fail, branch is merged locally
          }
        }

        // Update context.json on base branch after successful merge
        if (contextUpdate) {
          try {
            await writeContext(projectRoot, contextUpdate)
            await git.add('.contentrain/context.json')
            await git.commit('[contentrain] update context', { '--allow-empty': null, '--author': `${authorName} <${authorEmail}>` })
          } catch {
            // Context update is best-effort — don't fail the transaction
          }
        }
      } finally {
        if (needsStash) {
          try {
            await git.stash(['pop'])
          } catch {
            stashPopFailed = true
          }
        }
      }

      return {
        action: 'auto-merged' as const,
        commit: commitHash,
        ...(stashPopFailed ? { warning: 'Your uncommitted changes were stashed but could not be restored automatically. Run `git stash pop` to recover them.' } : {}),
      }
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
