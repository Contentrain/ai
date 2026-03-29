import { simpleGit } from 'simple-git'
import { join } from 'node:path'
import { rm as removeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../core/config.js'
import { writeContext } from '../core/context.js'
import { branchTimestamp } from '../util/id.js'
import type { SyncResult } from '@contentrain/types'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'

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
  commit(message: string, contextUpdate?: ContextUpdate): Promise<string>
  complete(): Promise<{ action: 'auto-merged' | 'pending-review'; commit: string; sync?: SyncResult; warning?: string }>
  cleanup(): Promise<void>
}

export async function ensureContentBranch(projectRoot: string): Promise<void> {
  const git = simpleGit(projectRoot)
  const config = await readConfig(projectRoot)

  // Check if contentrain branch exists locally
  const branches = await git.branchLocal()
  if (branches.all.includes(CONTENTRAIN_BRANCH)) return

  // Detect base branch
  const baseBranch = config?.repository?.default_branch
    || (await git.raw(['branch', '--show-current'])).trim()
    || 'main'

  // Create contentrain branch from base
  await git.branch([CONTENTRAIN_BRANCH, baseBranch])

  // Push to remote if exists
  const remoteName = process.env['CONTENTRAIN_REMOTE'] ?? 'origin'
  try {
    const remotes = await git.getRemotes()
    if (remotes.some(r => r.name === remoteName)) {
      await git.push(['-u', remoteName, CONTENTRAIN_BRANCH])
    }
  } catch {
    // Remote push is best-effort
  }
}

async function selectiveSync(
  projectRoot: string,
  _worktreePath: string,
  contentrainTip: string,
  _previousBaseRef?: string,
  dirtyFilesBeforeUpdate?: Set<string>,
): Promise<SyncResult> {
  const git = simpleGit(projectRoot)
  const synced: string[] = []
  const skipped: string[] = []

  // Use git plumbing to find ALL files that differ between old and new commits.
  // diff-tree is fast and ignores working tree / index state entirely.
  // Not limited to .contentrain/ — some ops also modify .gitignore, etc.
  const compareRef = _previousBaseRef ?? contentrainTip
  let changedFiles: string[] = []
  try {
    const diffOutput = await git.raw([
      'diff-tree', '--name-only', '-r', '--no-commit-id',
      compareRef, contentrainTip,
    ])
    changedFiles = diffOutput.split('\n').filter(f => f.trim().length > 0)
  } catch {
    // Fallback: list .contentrain/ files from the contentrainTip commit
    try {
      const lsOutput = await git.raw(['ls-tree', '-r', '--name-only', contentrainTip, '.contentrain/'])
      changedFiles = lsOutput.split('\n').filter(f => f.trim().length > 0)
    } catch {
      return { synced, skipped }
    }
  }

  if (changedFiles.length === 0) return { synced, skipped }

  // Use pre-captured dirty files (before update-ref) to avoid false positives.
  // After update-ref, files appear as "modified" in status even though the developer
  // didn't touch them. We use the pre-update state to know what was truly dirty.
  const dirtyFiles = dirtyFilesBeforeUpdate ?? new Set<string>()

  // Determine which changed files still exist in contentrainTip (HEAD after update-ref)
  // Check each changed file individually — `ls-tree` on specific paths is efficient
  const filesInTip = new Set<string>()
  for (const file of changedFiles) {
    try {
      await git.raw(['cat-file', '-e', `${contentrainTip}:${file}`])
      filesInTip.add(file)
    } catch {
      // File does not exist in tip (was deleted)
    }
  }

  for (const file of changedFiles) {
    if (dirtyFiles.has(file)) {
      skipped.push(file)
    } else if (filesInTip.has(file)) {
      // File exists in new HEAD — checkout from HEAD
      try {
        await git.checkout(['HEAD', '--', file])
        synced.push(file)
      } catch {
        skipped.push(file)
      }
    } else {
      // File was deleted in new HEAD — remove from working tree
      try {
        const filePath = join(projectRoot, file)
        await removeFile(filePath, { force: true })
        synced.push(file)
      } catch {
        skipped.push(file)
      }
    }
  }

  const warning = skipped.length > 0
    ? `${skipped.length} file(s) skipped due to local changes: ${skipped.join(', ')}. Commit your changes, then run: git checkout HEAD -- ${skipped.join(' ')}`
    : undefined

  return { synced, skipped, warning }
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

  // Detect base branch + current branch + remote in ONE batch
  // (reduces subprocess spawns from 4 to 2)
  let baseBranch = process.env['CONTENTRAIN_BRANCH'] ?? config?.repository?.default_branch ?? ''
  let currentBranch = ''
  let hasRemote = false

  const [branchResult, remotes] = await Promise.all([
    git.raw(['branch', '--show-current']).catch(() => ''),
    git.getRemotes().catch(() => []),
  ])
  currentBranch = branchResult.trim()
  if (!baseBranch) baseBranch = currentBranch || 'main'
  hasRemote = (remotes as { name: string }[]).some(r => r.name === remoteName)

  // Check if developer is on contentrain branch
  if (currentBranch === CONTENTRAIN_BRANCH) {
    throw Object.assign(new Error(
      `The '${CONTENTRAIN_BRANCH}' branch is checked out in your working directory. `
      + `Contentrain manages this branch automatically. `
      + `Switch to your working branch and retry.`,
    ), {
      code: 'CONTENT_BRANCH_CHECKED_OUT',
      agent_hint: 'Ask the developer to switch to their working branch (e.g., main or a feature branch), then retry the operation.',
      developer_action: `git checkout ${baseBranch}`,
    })
  }

  // Ensure contentrain branch exists (lightweight: single branchLocal check)
  const branches = await git.branchLocal()
  if (!branches.all.includes(CONTENTRAIN_BRANCH)) {
    await git.branch([CONTENTRAIN_BRANCH, baseBranch])
    if (hasRemote) {
      try { await git.push(['-u', remoteName, CONTENTRAIN_BRANCH]) } catch { /* best-effort */ }
    }
  }

  // Fetch latest from remote (parallel fetch for both branches)
  if (hasRemote) {
    await Promise.all([
      git.fetch(remoteName, baseBranch).catch(() => {}),
      git.fetch(remoteName, CONTENTRAIN_BRANCH).catch(() => {}),
    ])
  }

  const worktreePath = join(tmpdir(), `cr-${randomUUID()}`)
  const branch = branchName

  // Create worktree on contentrain branch
  await git.raw(['worktree', 'add', worktreePath, CONTENTRAIN_BRANCH])

  const wtGit = simpleGit(worktreePath)

  // Configure author (sequential — git config uses lock file)
  const authorName = process.env['CONTENTRAIN_AUTHOR_NAME'] ?? 'Contentrain'
  const authorEmail = process.env['CONTENTRAIN_AUTHOR_EMAIL'] ?? 'mcp@contentrain.io'
  await wtGit.addConfig('user.name', authorName)
  await wtGit.addConfig('user.email', authorEmail)

  // Sync contentrain with base branch (bring main changes into contentrain)
  try {
    await wtGit.merge([baseBranch, '--no-edit'])
  } catch {
    try { await wtGit.merge(['--abort']) } catch { /* not in merge state */ }
    if (hasRemote) {
      try {
        await wtGit.merge([`${remoteName}/${baseBranch}`, '--no-edit'])
      } catch {
        try { await wtGit.merge(['--abort']) } catch { /* ignore */ }
      }
    }
  }

  // Sync with remote contentrain if exists
  if (hasRemote) {
    try {
      await wtGit.merge([`${remoteName}/${CONTENTRAIN_BRANCH}`, '--no-edit'])
    } catch {
      try { await wtGit.merge(['--abort']) } catch { /* ignore */ }
    }
  }

  // Create feature branch from contentrain
  await wtGit.checkout(['-b', branch])

  let commitHash = ''

  return {
    worktree: worktreePath,
    branch,

    async write(callback) {
      await callback(worktreePath)
    },

    async commit(message, contextUpdate?) {
      // Write context.json together with content (no separate commit)
      if (contextUpdate) {
        await writeContext(worktreePath, contextUpdate)
      }
      await wtGit.add('.')
      const result = await wtGit.commit(message, { '--allow-empty': null })
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

      // auto-merge: merge feature branch into contentrain, then advance base

      // Switch to contentrain branch in worktree
      await wtGit.checkout(CONTENTRAIN_BRANCH)

      // Merge feature branch into contentrain
      try {
        await wtGit.merge([branch, '--no-edit'])
      } catch {
        try {
          await wtGit.merge(['--abort'])
        } catch { /* not in merge state */ }
        throw Object.assign(new Error(
          `Merge conflict when merging branch "${branch}" into "${CONTENTRAIN_BRANCH}". `
          + `The branch still exists with your changes intact. `
          + `Resolve the conflict manually, or delete the branch and retry.`,
        ), {
          code: 'CONTENT_BRANCH_MERGE_CONFLICT',
          agent_hint: 'The feature branch could not be merged into the contentrain branch. Ask the developer to resolve the conflict.',
          developer_action: `git checkout ${CONTENTRAIN_BRANCH} && git merge ${branch}`,
        })
      }

      // Get contentrain tip + old base ref + dirty files in parallel
      const [contentrainTip, previousBaseRef, statusBeforeUpdate] = await Promise.all([
        wtGit.raw(['rev-parse', 'HEAD']).then(s => s.trim()),
        git.raw(['rev-parse', baseBranch]).then(s => s.trim()),
        git.status(),
      ])
      const dirtyFilesBeforeUpdate = new Set(statusBeforeUpdate.files.map(f => f.path))

      // Verify fast-forward: baseBranch must be an ancestor of contentrainTip
      // (guaranteed by the merge above, but verify for safety)
      try {
        await git.raw(['merge-base', '--is-ancestor', previousBaseRef, contentrainTip])
      } catch {
        throw Object.assign(new Error(
          `Cannot fast-forward "${baseBranch}" to contentrain tip. `
          + `The base branch has diverged. Merge "${baseBranch}" into "${CONTENTRAIN_BRANCH}" first.`,
        ), {
          code: 'BASE_UPDATE_FAILED',
          agent_hint: `The base branch has commits not in contentrain. Merge ${baseBranch} into ${CONTENTRAIN_BRANCH} first.`,
          developer_action: `git checkout ${CONTENTRAIN_BRANCH} && git merge ${baseBranch} && git checkout ${baseBranch}`,
        })
      }

      // Advance base branch to contentrain tip via update-ref
      await git.raw(['update-ref', `refs/heads/${baseBranch}`, contentrainTip])

      // Refresh index to match new HEAD.
      // update-ref moves the branch pointer but leaves the index stale.
      // read-tree updates the index to match HEAD without touching the working tree.
      try {
        await git.raw(['read-tree', 'HEAD'])
      } catch {
        // fallback: try reset for older git versions
        try { await git.raw(['reset', 'HEAD']) } catch { /* ignore */ }
      }

      // Selective sync: copy .contentrain/ files to developer's working tree
      const sync = await selectiveSync(projectRoot, worktreePath, contentrainTip, previousBaseRef, dirtyFilesBeforeUpdate)

      // Push to remote (best-effort with retry)
      if (hasRemote) {
        // Push contentrain branch
        try {
          await git.push(remoteName, CONTENTRAIN_BRANCH)
        } catch {
          // Retry: fetch, merge, push
          try {
            await wtGit.fetch(remoteName, CONTENTRAIN_BRANCH)
            await wtGit.merge([`${remoteName}/${CONTENTRAIN_BRANCH}`, '--no-edit'])
            await git.push(remoteName, CONTENTRAIN_BRANCH)
          } catch {
            // Push failed after retry — continue, local state is fine
          }
        }

        // Push base branch
        try {
          await git.push(remoteName, baseBranch)
        } catch {
          // push may fail, local merge succeeded
        }
      }

      return {
        action: 'auto-merged' as const,
        commit: commitHash,
        sync,
        ...(sync.warning ? { warning: sync.warning } : {}),
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
  const parts = ['cr', scope, target]
  if (locale) parts.push(locale)
  parts.push(ts)
  return parts.join('/')
}
