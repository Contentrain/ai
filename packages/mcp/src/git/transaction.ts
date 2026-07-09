import { simpleGit, type SimpleGit } from 'simple-git'
import { join } from 'node:path'
import { rm as removeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../core/config.js'
import { writeContext } from '../core/context.js'
import { deleteRemoteBranch, type RemoteDeleteResult } from './branch-lifecycle.js'
import { branchTimestamp } from '../util/id.js'
import { migrateLegacyBranches } from '../providers/local/migration.js'
import type { SyncResult, WorkflowMode } from '@contentrain/types'
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

  // Clean up legacy `contentrain/*` feature branches so the singleton
  // `contentrain` ref can be created. Idempotent — safe to call even
  // when no legacy branches exist.
  await migrateLegacyBranches(git, baseBranch)

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

/**
 * Commit identity for worktree operations, supplied via environment instead
 * of two `git config` spawns per transaction. Git honors GIT_AUTHOR_* /
 * GIT_COMMITTER_* for both the sync merges and the feature-branch commit, so
 * a worktree git built with this env needs no `git config user.*` calls.
 * `process.env` is spread so PATH/HOME and any GIT_* already set survive.
 */
function authorEnv(): Record<string, string | undefined> {
  const name = process.env['CONTENTRAIN_AUTHOR_NAME'] ?? 'Contentrain'
  const email = process.env['CONTENTRAIN_AUTHOR_EMAIL'] ?? 'ai@contentrain.io'
  return {
    ...process.env,
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
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

  // Which changed files still exist in contentrainTip (HEAD after update-ref)?
  // ONE `ls-tree` over the changed paths lists exactly the survivors, instead
  // of a `cat-file -e` spawn per file. Falls back to per-file probing if
  // ls-tree fails so behavior is preserved on any edge.
  const filesInTip = new Set<string>()
  try {
    const lsOutput = await git.raw(['ls-tree', '-r', '--name-only', contentrainTip, '--', ...changedFiles])
    for (const f of lsOutput.split('\n')) {
      const trimmed = f.trim()
      if (trimmed) filesInTip.add(trimmed)
    }
  } catch {
    for (const file of changedFiles) {
      try {
        await git.raw(['cat-file', '-e', `${contentrainTip}:${file}`])
        filesInTip.add(file)
      } catch {
        // File does not exist in tip (was deleted)
      }
    }
  }

  // Partition: dirty developer files are skipped; survivors get checked out
  // from HEAD; the rest were deleted in the new HEAD and are removed on disk.
  const toCheckout: string[] = []
  const toRemove: string[] = []
  for (const file of changedFiles) {
    if (dirtyFiles.has(file)) skipped.push(file)
    else if (filesInTip.has(file)) toCheckout.push(file)
    else toRemove.push(file)
  }

  // ONE `git checkout HEAD -- f1 f2 …` restores every clean survivor at once.
  // On failure, fall back to per-file so a single unresolvable path still
  // yields precise skip accounting (dirty files were already excluded).
  if (toCheckout.length > 0) {
    try {
      await git.checkout(['HEAD', '--', ...toCheckout])
      synced.push(...toCheckout)
    } catch {
      for (const file of toCheckout) {
        try {
          await git.checkout(['HEAD', '--', file])
          synced.push(file)
        } catch {
          skipped.push(file)
        }
      }
    }
  }

  // Deletions are working-tree fs removals — no git spawn, safe to parallelize.
  await Promise.all(toRemove.map(async (file) => {
    try {
      await removeFile(join(projectRoot, file), { force: true })
      synced.push(file)
    } catch {
      skipped.push(file)
    }
  }))

  const warning = skipped.length > 0
    ? `${skipped.length} file(s) skipped due to local changes: ${skipped.join(', ')}. Commit your changes, then run: git checkout HEAD -- ${skipped.join(' ')}`
    : undefined

  return { synced, skipped, warning }
}

export async function createTransaction(
  projectRoot: string,
  branchName: string,
  options?: { workflowOverride?: WorkflowMode },
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

  // Ensure contentrain branch exists (with migration for old contentrain/* branches)
  await ensureContentBranch(projectRoot)

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

  // Commit identity comes from the environment (see authorEnv) — no
  // `git config user.*` spawns.
  const wtGit = simpleGit(worktreePath).env(authorEnv())

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
  let pendingReview = false
  let savedContextUpdate: ContextUpdate | undefined

  return {
    worktree: worktreePath,
    branch,

    async write(callback) {
      await callback(worktreePath)
    },

    async commit(message, contextUpdate?) {
      // context.json is intentionally NOT committed on the feature branch — it
      // is regenerated on the contentrain branch after the merge (see
      // complete()). Committing it per-branch caused cross-branch merge
      // conflicts on a single mutable file. `--no-verify` keeps the repo's
      // commit-msg / pre-commit hooks (commitlint, lefthook, husky) from
      // rejecting these machine-generated infra commits.
      savedContextUpdate = contextUpdate
      await wtGit.add('.')
      const result = await wtGit.commit(message, { '--allow-empty': null, '--no-verify': null })
      commitHash = result.commit || ''
      return commitHash
    },

    async complete() {
      if (workflow === 'review') {
        if (hasRemote) {
          await git.push(remoteName, branch)
        }
        // Pending-review branches must survive for a later contentrain_merge.
        pendingReview = true
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

      // Regenerate context.json on the contentrain branch (post-merge,
      // single-threaded) and fold it into the tip before advancing the base.
      if (savedContextUpdate) {
        await regenerateContextOnContentrain(wtGit, worktreePath, savedContextUpdate)
      }

      // Get contentrain tip + old base ref + dirty files in parallel
      const [contentrainTip, previousBaseRef, statusBeforeUpdate] = await Promise.all([
        wtGit.raw(['rev-parse', 'HEAD']).then(s => s.trim()),
        git.raw(['rev-parse', baseBranch]).then(s => s.trim()),
        git.status(),
      ])
      const dirtyFilesBeforeUpdate = new Set(statusBeforeUpdate.files.map(f => f.path))

      // Verify fast-forward: baseBranch must be an ancestor of contentrainTip
      // (guaranteed by the merge above, but verify for safety).
      // `rev-list --count` instead of `merge-base --is-ancestor`: the latter
      // signals via exit code with empty stderr, which simple-git reports as
      // success — the guard would silently pass on divergence.
      if (!(await isAncestor(git, previousBaseRef, contentrainTip))) {
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
      // Prune the feature branch unless it is a pending-review branch that must
      // survive for a later contentrain_merge. Auto-merged branches (already in
      // contentrain) and failed/empty branches are both safe to delete, so
      // failed saves and merged saves no longer leak dangling cr/* refs.
      if (!pendingReview) {
        await safeDeleteBranch(git, branch)
      }
    },
  }
}

export async function mergeBranch(
  projectRoot: string,
  branchName: string,
): Promise<{ action: 'merged'; commit: string; sync: SyncResult; remote?: RemoteDeleteResult }> {
  const git = simpleGit(projectRoot)
  const config = await readConfig(projectRoot)
  const remoteName = process.env['CONTENTRAIN_REMOTE'] ?? 'origin'

  // Detect base branch
  const baseBranch = process.env['CONTENTRAIN_BRANCH']
    ?? config?.repository?.default_branch
    ?? ((await git.raw(['branch', '--show-current'])).trim() || 'main')

  // Ensure contentrain branch exists
  await ensureContentBranch(projectRoot)

  // Check remote
  let hasRemote = false
  try {
    const remotes = await git.getRemotes()
    hasRemote = remotes.some(r => r.name === remoteName)
  } catch {
    hasRemote = false
  }

  // Create temp worktree on contentrain branch
  const worktreePath = join(tmpdir(), `cr-merge-${randomUUID()}`)
  await git.raw(['worktree', 'add', worktreePath, CONTENTRAIN_BRANCH])

  // Commit identity from the environment (see authorEnv) — no config spawns.
  const wtGit = simpleGit(worktreePath).env(authorEnv())

  try {
    // Merge the feature branch into contentrain
    try {
      await wtGit.merge([branchName, '--no-edit'])
    } catch {
      try { await wtGit.merge(['--abort']) } catch { /* not in merge state */ }
      throw Object.assign(new Error(
        `Merge conflict when merging branch "${branchName}" into "${CONTENTRAIN_BRANCH}". `
        + `The branch still exists with your changes intact. `
        + `Resolve the conflict manually, or delete the branch and retry.`,
      ), {
        code: 'CONTENT_BRANCH_MERGE_CONFLICT',
        agent_hint: 'The feature branch could not be merged into the contentrain branch. Ask the developer to resolve the conflict.',
        developer_action: `git checkout ${CONTENTRAIN_BRANCH} && git merge ${branchName}`,
      })
    }

    // Regenerate context.json on contentrain post-merge (deterministic,
    // single-threaded) so review-mode branches — which carry no context.json —
    // still produce up-to-date stats once landed.
    await regenerateContextOnContentrain(wtGit, worktreePath, { tool: 'contentrain_merge', model: '*' })

    // Get contentrain tip + old base ref + dirty files in parallel
    const [contentrainTip, previousBaseRef, statusBeforeUpdate] = await Promise.all([
      wtGit.raw(['rev-parse', 'HEAD']).then(s => s.trim()),
      git.raw(['rev-parse', baseBranch]).then(s => s.trim()),
      git.status(),
    ])
    const dirtyFilesBeforeUpdate = new Set(statusBeforeUpdate.files.map(f => f.path))

    // Verify fast-forward: baseBranch must be an ancestor of contentrainTip.
    // (See complete() — merge-base --is-ancestor is unusable via simple-git.)
    if (!(await isAncestor(git, previousBaseRef, contentrainTip))) {
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

    // Refresh index to match new HEAD
    try {
      await git.raw(['read-tree', 'HEAD'])
    } catch {
      try { await git.raw(['reset', 'HEAD']) } catch { /* ignore */ }
    }

    // Selective sync: copy .contentrain/ files to developer's working tree
    const sync = await selectiveSync(projectRoot, worktreePath, contentrainTip, previousBaseRef, dirtyFilesBeforeUpdate)

    // Push to remote (best-effort)
    if (hasRemote) {
      try {
        await git.push(remoteName, CONTENTRAIN_BRANCH)
      } catch {
        try {
          await wtGit.fetch(remoteName, CONTENTRAIN_BRANCH)
          await wtGit.merge([`${remoteName}/${CONTENTRAIN_BRANCH}`, '--no-edit'])
          await git.push(remoteName, CONTENTRAIN_BRANCH)
        } catch {
          // Push failed after retry — continue, local state is fine
        }
      }

      try {
        await git.push(remoteName, baseBranch)
      } catch {
        // push may fail, local merge succeeded
      }
    }

    // Prune the now-merged feature branch so merged cr/* refs don't accumulate.
    await safeDeleteBranch(git, branchName)

    // Delete the remote copy too (review-mode branches were pushed on save).
    // Best-effort and config-gated inside the helper: a failure surfaces as
    // `remote.warning`, never as a failed merge.
    let remote: RemoteDeleteResult | undefined
    if (hasRemote) {
      remote = await deleteRemoteBranch(projectRoot, branchName, { config })
    }

    return {
      action: 'merged' as const,
      commit: contentrainTip,
      sync,
      ...(remote ? { remote } : {}),
    }
  } finally {
    // Cleanup worktree
    try {
      await git.raw(['worktree', 'remove', worktreePath, '--force'])
    } catch {
      // worktree may already be cleaned up
    }
  }
}

export function buildBranchName(scope: string, target: string, locale?: string): string {
  const ts = branchTimestamp()
  const parts = ['cr', scope, target]
  if (locale) parts.push(locale)
  parts.push(ts)
  return parts.join('/')
}

/**
 * True when `ancestor` is an ancestor of (or equal to) `descendant`.
 * Implemented with `rev-list --count` because `merge-base --is-ancestor`
 * signals via exit code with empty stderr — simple-git reports that as
 * success, so it cannot express a negative verdict.
 */
async function isAncestor(git: SimpleGit, ancestor: string, descendant: string): Promise<boolean> {
  try {
    const count = Number((await git.raw(['rev-list', '--count', ancestor, `^${descendant}`])).trim())
    return count === 0
  } catch {
    return false
  }
}

/**
 * Force-delete a local branch, swallowing all errors. Never deletes the
 * singleton `contentrain` branch. Used to prune feature branches after they
 * are merged (auto-merge / contentrain_merge) or when a transaction fails
 * before completing — so failed/merged `cr/*` refs do not accumulate.
 */
async function safeDeleteBranch(git: SimpleGit, branch: string): Promise<void> {
  if (!branch || branch === CONTENTRAIN_BRANCH) return
  try {
    await git.raw(['branch', '-D', branch])
  } catch {
    // Branch may not exist, be checked out, or already be deleted — ignore.
  }
}

/**
 * Regenerate `.contentrain/context.json` deterministically inside a worktree
 * that is currently on the `contentrain` branch, then commit it (hooks
 * bypassed). Called AFTER a feature branch is merged so context.json is only
 * ever written on `contentrain`, single-threaded — eliminating the per-branch
 * merge conflicts that came from committing it on every feature branch.
 */
async function regenerateContextOnContentrain(
  wtGit: SimpleGit,
  worktreePath: string,
  contextUpdate: ContextUpdate,
): Promise<void> {
  await writeContext(worktreePath, contextUpdate)
  await wtGit.add('.contentrain/context.json')
  try {
    await wtGit.commit('[contentrain] context: update', { '--no-verify': null })
  } catch {
    // Nothing staged (context.json unchanged) — fine.
  }
}
