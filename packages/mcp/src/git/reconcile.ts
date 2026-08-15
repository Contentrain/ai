import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import type { BaseAdvance, ConflictResolution, ContextSource, RemotePush, SyncResult } from '@contentrain/types'
import { createGit, authorConfig } from './identity.js'
import { networkGit } from './branch-lifecycle.js'
import { GitRefReader } from './ref-reader.js'
import {
  NETWORK_TIMEOUT_MS,
  ensureContentBranch,
  isAncestor,
  pushContentBranches,
  selectiveSync,
} from './transaction.js'
import { readConfig } from '../core/config.js'
import { planReconcile } from '../core/ops/reconcile/index.js'
import type { ReconcilePlan } from '../core/ops/reconcile/index.js'
import { applyChangesToWorktree } from '../core/ops/apply-to-worktree.js'

export interface ReconcileBranchesOptions {
  /** Preview only — plan, never touch a ref. Default true. */
  dryRun?: boolean
  /** Decisions for previously reported conflicts, matched by id. */
  resolutions?: ConflictResolution[]
  /** Stamped into the regenerated context.json. */
  source?: ContextSource
}

export interface ReconcileBranchesResult {
  /**
   * `in_sync` — nothing to reconcile (base already contained in contentrain
   * and no content differences; a base merely behind was fast-forwarded).
   * `preview` — dry-run: the plan says what WOULD happen.
   * `conflicts` — unresolved conflicts remain; nothing was written.
   * `reconciled` — the merge commit landed and the base branch advanced.
   */
  action: 'in_sync' | 'preview' | 'conflicts' | 'reconciled'
  plan: ReconcilePlan
  base: string
  merge_base: string | null
  commit?: string
  base_advance?: BaseAdvance
  sync?: SyncResult
  remote_push?: RemotePush
}

/**
 * Content-aware reconcile of a diverged `contentrain` ↔ base pair, local
 * executor. Plans with three `GitRefReader`s (no checkout, developer tree
 * untouched), then — when clean or fully resolved — performs a REAL
 * `git merge --no-commit` in a temp worktree and writes the ENTIRE plan
 * output over it before committing: for content-owned paths the planner is
 * authoritative, never git's textual auto-merge (its line-level result can
 * be non-canonical or wrong without ever surfacing as a conflict). Git
 * still resolves everything the planner does not own — source files, lock
 * files — exactly as a manual merge would. The commit joins both parents,
 * so afterwards the base branch is an ancestor again and the ordinary
 * fast-forward advance works.
 *
 * Reconcile never runs inside a write path: it is an explicit, separate
 * step (tool, CLI, or Studio background job).
 */
export async function reconcileBranches(
  projectRoot: string,
  options: ReconcileBranchesOptions = {},
): Promise<ReconcileBranchesResult> {
  const dryRun = options.dryRun ?? true
  const git = createGit(projectRoot)
  const config = await readConfig(projectRoot)
  const remoteName = process.env['CONTENTRAIN_REMOTE'] ?? 'origin'

  const baseBranch = process.env['CONTENTRAIN_BRANCH']
    ?? config?.repository?.default_branch
    ?? ((await git.raw(['branch', '--show-current'])).trim() || 'main')

  const currentBranch = (await git.raw(['branch', '--show-current']).catch(() => '')).trim()
  if (currentBranch === CONTENTRAIN_BRANCH) {
    throw Object.assign(new Error(
      `The '${CONTENTRAIN_BRANCH}' branch is checked out in your working directory. `
      + `Switch to your working branch and retry.`,
    ), {
      code: 'CONTENT_BRANCH_CHECKED_OUT',
      agent_hint: 'Ask the developer to switch to their working branch, then retry.',
      developer_action: `git checkout ${baseBranch}`,
    })
  }

  await ensureContentBranch(projectRoot)

  let hasRemote = false
  try {
    const remotes = await git.getRemotes()
    hasRemote = remotes.some(r => r.name === remoteName)
  } catch {
    hasRemote = false
  }
  if (hasRemote) {
    const net = networkGit(projectRoot, NETWORK_TIMEOUT_MS)
    await Promise.all([
      net.fetch(remoteName, baseBranch).catch(() => {}),
      net.fetch(remoteName, CONTENTRAIN_BRANCH).catch(() => {}),
    ])
  }

  const [contentrainTip, baseTip] = await Promise.all([
    git.raw(['rev-parse', CONTENTRAIN_BRANCH]).then(s => s.trim()),
    git.raw(['rev-parse', baseBranch]).then(s => s.trim()),
  ])

  let mergeBase: string | null = null
  try {
    mergeBase = (await git.raw(['merge-base', CONTENTRAIN_BRANCH, baseBranch])).trim() || null
  } catch {
    mergeBase = null
  }
  if (!mergeBase) {
    throw Object.assign(new Error(
      `"${CONTENTRAIN_BRANCH}" and "${baseBranch}" share no history — reconcile needs a common ancestor.`,
    ), {
      code: 'RECONCILE_NO_MERGE_BASE',
      agent_hint: 'The branches are unrelated. This needs a human decision about which history is canonical.',
    })
  }

  const plan = await planReconcile({
    base: new GitRefReader(projectRoot, mergeBase),
    ours: new GitRefReader(projectRoot, CONTENTRAIN_BRANCH),
    theirs: new GitRefReader(projectRoot, baseBranch),
    resolutions: options.resolutions,
    source: options.source ?? 'mcp-local',
  })

  // Base already contained in contentrain: there is no divergence. A base
  // merely BEHIND is fast-forwarded on the spot (that is what the ordinary
  // write path would do next anyway).
  if (await isAncestor(git, baseTip, contentrainTip)) {
    if (!dryRun && baseTip !== contentrainTip) {
      await git.raw(['update-ref', `refs/heads/${baseBranch}`, contentrainTip])
      try {
        await git.raw(['read-tree', 'HEAD'])
      } catch {
        try { await git.raw(['reset', 'HEAD']) } catch { /* ignore */ }
      }
      return { action: 'reconciled', plan, base: baseBranch, merge_base: mergeBase, commit: contentrainTip, base_advance: 'advanced' }
    }
    return { action: 'in_sync', plan, base: baseBranch, merge_base: mergeBase }
  }

  if (dryRun) {
    return { action: 'preview', plan, base: baseBranch, merge_base: mergeBase }
  }
  if (plan.conflicts.length > 0) {
    return { action: 'conflicts', plan, base: baseBranch, merge_base: mergeBase }
  }

  // Execute: real merge in a temp worktree, planner output written on top.
  const worktreePath = join(tmpdir(), `cr-reconcile-${randomUUID()}`)
  await git.raw(['worktree', 'add', worktreePath, CONTENTRAIN_BRANCH])
  const wtGit = createGit(worktreePath, { config: authorConfig() })

  try {
    try {
      await wtGit.merge([baseBranch, '--no-commit', '--no-ff'])
    } catch {
      // Conflicts inside the worktree are expected — the planner's output
      // overwrites every content-owned path next. Anything left unmerged
      // after that is genuinely outside the planner's scope.
    }

    await applyChangesToWorktree(worktreePath, plan.changes)
    await wtGit.raw(['add', '-A'])

    const unmerged = (await wtGit.raw(['ls-files', '-u'])).trim()
    if (unmerged) {
      const paths = [...new Set(unmerged.split('\n').map(l => l.split('\t')[1]).filter(Boolean))]
      try { await wtGit.merge(['--abort']) } catch { /* not in merge state */ }
      throw Object.assign(new Error(
        `Reconcile stopped: ${paths.length} non-content file(s) conflict between "${CONTENTRAIN_BRANCH}" and "${baseBranch}": ${paths.join(', ')}. `
        + `These are outside the content planner's scope and need a manual merge.`,
      ), {
        code: 'RECONCILE_SOURCE_CONFLICT',
        agent_hint: 'Non-content files conflict. Ask the developer to merge the branches manually for those paths.',
        developer_action: `git checkout ${CONTENTRAIN_BRANCH} && git merge ${baseBranch}`,
      })
    }

    await wtGit.commit(
      `[contentrain] reconcile: merge ${baseBranch} into ${CONTENTRAIN_BRANCH}`,
      { '--no-verify': null },
    )

    const [newTip, previousBaseRef, statusBeforeUpdate] = await Promise.all([
      wtGit.raw(['rev-parse', 'HEAD']).then(s => s.trim()),
      git.raw(['rev-parse', baseBranch]).then(s => s.trim()),
      git.status(),
    ])
    const dirtyFilesBeforeUpdate = new Set(statusBeforeUpdate.files.map(f => f.path))

    // The merge commit has baseBranch as a parent, so this is a true
    // fast-forward again — the whole point of the exercise.
    await git.raw(['update-ref', `refs/heads/${baseBranch}`, newTip])
    try {
      await git.raw(['read-tree', 'HEAD'])
    } catch {
      try { await git.raw(['reset', 'HEAD']) } catch { /* ignore */ }
    }
    const sync = await selectiveSync(projectRoot, worktreePath, newTip, previousBaseRef, dirtyFilesBeforeUpdate)

    let remotePush: RemotePush = 'no-remote'
    if (hasRemote) {
      remotePush = await pushContentBranches(projectRoot, worktreePath, wtGit, remoteName, baseBranch, true)
    }

    return {
      action: 'reconciled',
      plan,
      base: baseBranch,
      merge_base: mergeBase,
      commit: newTip,
      base_advance: 'advanced',
      sync,
      remote_push: remotePush,
    }
  } finally {
    try {
      await git.raw(['worktree', 'remove', worktreePath, '--force'])
    } catch {
      // worktree may already be cleaned up
    }
  }
}
