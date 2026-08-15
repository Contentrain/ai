import { type SimpleGit } from 'simple-git'
import { createGit } from '../git/identity.js'
import { join } from 'node:path'
import { rm as removeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../core/config.js'
import { writeContext } from '../core/context.js'
import { deleteRemoteBranch, networkGit, type RemoteDeleteResult } from './branch-lifecycle.js'
import { authorConfig } from './identity.js'
import { branchTimestamp } from '../util/id.js'
import { migrateLegacyBranches } from '../providers/local/migration.js'
import type { BaseAdvance, RemotePush, SyncResult, WorkflowMode } from '@contentrain/types'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'

/**
 * Block-timeout for fetch/push inside transactions. These calls inherit the
 * host's credential setup (see networkGit); without a timeout a hung SSH
 * passphrase prompt would hang the MCP call with it.
 */
export const NETWORK_TIMEOUT_MS = 10_000

export interface ContextUpdate {
  tool: string
  model: string
  locale?: string
  entries?: string[]
}

/**
 * Result of completing a write transaction.
 *
 * A diverged base branch is NOT an error: the content is committed and merged
 * into the contentrain branch either way — only the base fast-forward is
 * pending. `base_advance: 'blocked_diverged'` reports that truthfully instead
 * of failing a write that in fact landed.
 */
export interface CompleteResult {
  action: 'auto-merged' | 'pending-review'
  commit: string
  sync?: SyncResult
  warning?: string
  /** Present on `auto-merged`: did the base branch advance to the contentrain tip? */
  base_advance?: BaseAdvance
  /** Present on `auto-merged`: outcome of pushing the contentrain branch. */
  remote_push?: RemotePush
}

/** Result of landing a feature branch via {@link mergeBranch}. */
export interface MergeBranchResult {
  action: 'merged'
  commit: string
  sync: SyncResult
  base_advance: BaseAdvance
  remote_push: RemotePush
  warning?: string
  remote?: RemoteDeleteResult
}

export interface GitTransaction {
  worktree: string
  branch: string
  write(callback: (worktreePath: string) => Promise<void>): Promise<void>
  commit(message: string, contextUpdate?: ContextUpdate): Promise<string>
  complete(): Promise<CompleteResult>
  cleanup(): Promise<void>
}

export async function ensureContentBranch(projectRoot: string): Promise<void> {
  const git = createGit(projectRoot)
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

export async function selectiveSync(
  projectRoot: string,
  _worktreePath: string,
  contentrainTip: string,
  _previousBaseRef?: string,
  dirtyFilesBeforeUpdate?: Set<string>,
): Promise<SyncResult> {
  const git = createGit(projectRoot)
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
  const git = createGit(projectRoot)
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

  // Fetch latest from remote (parallel fetch for both branches). Hardened:
  // no interactive credential prompt, block-timeout on hangs.
  if (hasRemote) {
    const net = networkGit(projectRoot, NETWORK_TIMEOUT_MS)
    await Promise.all([
      net.fetch(remoteName, baseBranch).catch(() => {}),
      net.fetch(remoteName, CONTENTRAIN_BRANCH).catch(() => {}),
    ])
  }

  const worktreePath = join(tmpdir(), `cr-${randomUUID()}`)
  const branch = branchName

  // Create worktree on contentrain branch
  await git.raw(['worktree', 'add', worktreePath, CONTENTRAIN_BRANCH])

  // Commit identity comes from `-c user.*` config (see authorConfig) — passed
  // as args, never via `.env()`, so simple-git's block-unsafe guard is never
  // triggered by an inherited EDITOR/GIT_ASKPASS/etc.
  const wtGit = createGit(worktreePath, { config: authorConfig() })

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
  // Set once the feature branch has been merged into the contentrain branch,
  // which is what makes deleting it in cleanup() safe — the work is reachable
  // from contentrain at that point.
  let mergedIntoContentrain = false
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
        // Mark the branch as surviving BEFORE attempting the push. The commit
        // already exists at this point, so a push failure (no write access,
        // offline, expired credentials) must not make cleanup() treat this as
        // a failed transaction and delete the branch — that silently discards
        // committed work. Pushing is a convenience here; contentrain_submit is
        // the documented way to publish a review branch.
        pendingReview = true

        let warning: string | undefined
        if (hasRemote) {
          try {
            await networkGit(projectRoot, NETWORK_TIMEOUT_MS).push(remoteName, branch)
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            warning = `Changes are committed locally on "${branch}", but pushing to "${remoteName}" failed: ${detail.trim()}. `
              + `The branch is intact — run contentrain_submit once you have push access, or merge it locally with contentrain_merge.`
          }
        }

        return { action: 'pending-review', commit: commitHash, warning }
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
      // The commit is now reachable from contentrain, so cleanup() may prune
      // the feature branch. Anything that fails after this point still leaves
      // the work safe.
      mergedIntoContentrain = true

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

      // Fast-forward check: baseBranch must be an ancestor of contentrainTip.
      // `rev-list --count` instead of `merge-base --is-ancestor`: the latter
      // signals via exit code with empty stderr, which simple-git reports as
      // success — the check would silently pass on divergence.
      //
      // Divergence is NOT an error here. The content is already committed and
      // merged into contentrain (the CDN's source of truth) — only the base
      // fast-forward is impossible. Throwing at this point used to report a
      // failure for a write that had in fact landed, while cleanup() deleted
      // the cr/* branch. Report the truth instead.
      let sync: SyncResult = { synced: [], skipped: [] }
      let baseAdvance: BaseAdvance
      let divergedWarning: string | undefined
      if (await isAncestor(git, previousBaseRef, contentrainTip)) {
        baseAdvance = 'advanced'

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

        // Selective sync: copy .contentrain/ files to developer's working tree.
        // Only after an advance — when the base did not move, the developer's
        // HEAD did not change, and syncing files from the contentrain tip
        // would desync their working tree from their own HEAD.
        sync = await selectiveSync(projectRoot, worktreePath, contentrainTip, previousBaseRef, dirtyFilesBeforeUpdate)
      } else {
        baseAdvance = 'blocked_diverged'
        divergedWarning = `Content is committed and merged into "${CONTENTRAIN_BRANCH}", but "${baseBranch}" has commits that are not in "${CONTENTRAIN_BRANCH}" — the branches have diverged, so "${baseBranch}" was not advanced. Reconcile the branches to bring "${baseBranch}" up to date.`
      }

      // Push contentrain (with retry) and, when advanced, the base branch.
      let remotePush: RemotePush = 'no-remote'
      if (hasRemote) {
        remotePush = await pushContentBranches(projectRoot, worktreePath, wtGit, remoteName, baseBranch, baseAdvance === 'advanced')
      }

      const warnings = [divergedWarning, sync.warning].filter(Boolean)
      return {
        action: 'auto-merged' as const,
        commit: commitHash,
        sync,
        base_advance: baseAdvance,
        remote_push: remotePush,
        ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
      }
    },

    async cleanup() {
      try {
        await git.raw(['worktree', 'remove', worktreePath, '--force'])
      } catch {
        // worktree may already be cleaned up
      }
      // Prune the feature branch only when doing so cannot lose work:
      //   - pendingReview: must survive for a later contentrain_submit/merge
      //   - commitHash === '': nothing was ever committed, safe to drop
      //   - mergedIntoContentrain: the work is reachable from contentrain
      // Anything else means the branch holds a commit that is reachable from
      // nowhere else, and deleting it would silently discard the user's work
      // while the caller reports success. Keeping it may leave a stray cr/*
      // ref after a failure — that is recoverable; a deleted commit is not.
      const holdsUnreachableWork = commitHash !== '' && !mergedIntoContentrain
      if (!pendingReview && !holdsUnreachableWork) {
        await safeDeleteBranch(git, branch)
      }
    },
  }
}

export async function mergeBranch(
  projectRoot: string,
  branchName: string,
): Promise<MergeBranchResult> {
  const git = createGit(projectRoot)
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

  // Fetch latest from remote before merging — an approve against stale
  // remote-tracking refs is how an already-reconciled divergence keeps
  // reporting itself. Hardened: no credential prompt, block-timeout.
  if (hasRemote) {
    const net = networkGit(projectRoot, NETWORK_TIMEOUT_MS)
    await Promise.all([
      net.fetch(remoteName, baseBranch).catch(() => {}),
      net.fetch(remoteName, CONTENTRAIN_BRANCH).catch(() => {}),
    ])
  }

  // Create temp worktree on contentrain branch
  const worktreePath = join(tmpdir(), `cr-merge-${randomUUID()}`)
  await git.raw(['worktree', 'add', worktreePath, CONTENTRAIN_BRANCH])

  // Commit identity from `-c user.*` config (see authorConfig) — guard-safe,
  // no `.env()` spread.
  const wtGit = createGit(worktreePath, { config: authorConfig() })

  try {
    // Sync contentrain with the base branch (and remotes) BEFORE landing the
    // feature branch — the counterpart of the pre-fork sync in
    // createTransaction. Without it, one base commit that is not in
    // contentrain makes every merge report a diverged base forever. A
    // conflicting sync is aborted silently; the fast-forward check below then
    // reports the divergence truthfully instead of this call guessing at it.
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
    if (hasRemote) {
      try {
        await wtGit.merge([`${remoteName}/${CONTENTRAIN_BRANCH}`, '--no-edit'])
      } catch {
        try { await wtGit.merge(['--abort']) } catch { /* ignore */ }
      }
    }

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

    // Fast-forward check: baseBranch must be an ancestor of contentrainTip.
    // (See complete() — merge-base --is-ancestor is unusable via simple-git.)
    // Divergence is NOT an error: the feature branch is already merged into
    // contentrain; only the base advance is pending until the branches are
    // reconciled. Throwing here used to strand the cr/* branch as a phantom
    // "pending review" while its content was already on contentrain.
    let sync: SyncResult = { synced: [], skipped: [] }
    let baseAdvance: BaseAdvance
    let divergedWarning: string | undefined
    if (await isAncestor(git, previousBaseRef, contentrainTip)) {
      baseAdvance = 'advanced'

      // Advance base branch to contentrain tip via update-ref
      await git.raw(['update-ref', `refs/heads/${baseBranch}`, contentrainTip])

      // Refresh index to match new HEAD
      try {
        await git.raw(['read-tree', 'HEAD'])
      } catch {
        try { await git.raw(['reset', 'HEAD']) } catch { /* ignore */ }
      }

      // Selective sync: copy .contentrain/ files to developer's working tree.
      // Only after an advance — see complete() for why.
      sync = await selectiveSync(projectRoot, worktreePath, contentrainTip, previousBaseRef, dirtyFilesBeforeUpdate)
    } else {
      baseAdvance = 'blocked_diverged'
      divergedWarning = `Branch "${branchName}" is merged into "${CONTENTRAIN_BRANCH}", but "${baseBranch}" has commits that are not in "${CONTENTRAIN_BRANCH}" — the branches have diverged, so "${baseBranch}" was not advanced. Reconcile the branches to bring "${baseBranch}" up to date.`
    }

    // Push contentrain (with retry) and, when advanced, the base branch.
    let remotePush: RemotePush = 'no-remote'
    if (hasRemote) {
      remotePush = await pushContentBranches(projectRoot, worktreePath, wtGit, remoteName, baseBranch, baseAdvance === 'advanced')
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

    const warnings = [divergedWarning, sync.warning].filter(Boolean)
    return {
      action: 'merged' as const,
      commit: contentrainTip,
      sync,
      base_advance: baseAdvance,
      remote_push: remotePush,
      ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
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
export async function isAncestor(git: SimpleGit, ancestor: string, descendant: string): Promise<boolean> {
  try {
    const count = Number((await git.raw(['rev-list', '--count', ancestor, `^${descendant}`])).trim())
    return count === 0
  } catch {
    return false
  }
}

/**
 * Push the contentrain branch (with one fetch-merge-retry) and, when the base
 * advanced, the base branch. Returns the push outcome for contentrain; the
 * base push is best-effort and never demotes the outcome, because the
 * contentrain branch is the content SSOT — it is what the CDN reads.
 *
 * The retry absorbs a concurrent remote advance (another writer pushed
 * contentrain first): fetch, merge the remote tip into the local worktree's
 * contentrain, push again. A conflicting retry-merge is aborted and reported
 * as `rejected` — that is a real divergence, not a race.
 */
export async function pushContentBranches(
  projectRoot: string,
  worktreePath: string,
  wtGit: SimpleGit,
  remoteName: string,
  baseBranch: string,
  baseAdvanced: boolean,
): Promise<RemotePush> {
  const net = networkGit(projectRoot, NETWORK_TIMEOUT_MS)
  let outcome: RemotePush = 'pushed'
  try {
    await net.push(remoteName, CONTENTRAIN_BRANCH)
  } catch {
    try {
      await networkGit(worktreePath, NETWORK_TIMEOUT_MS).fetch(remoteName, CONTENTRAIN_BRANCH)
      await wtGit.merge([`${remoteName}/${CONTENTRAIN_BRANCH}`, '--no-edit'])
      await net.push(remoteName, CONTENTRAIN_BRANCH)
    } catch {
      try { await wtGit.merge(['--abort']) } catch { /* not in merge state */ }
      outcome = 'rejected'
    }
  }
  if (baseAdvanced) {
    try {
      await net.push(remoteName, baseBranch)
    } catch {
      // Best-effort: a failed base push alone does not demote the outcome.
    }
  }
  return outcome
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
