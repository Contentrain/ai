import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { z } from 'zod'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { ToolProvider } from '../server.js'
import { validateProject } from '../core/validator/index.js'
import { readConfig } from '../core/config.js'
import { createTransaction, buildBranchName, mergeBranch } from '../git/transaction.js'
import { checkBranchHealth, cleanupMergedBranches, deleteRemoteBranch, listRemoteCrBranches, pruneMergedRemoteBranches } from '../git/branch-lifecycle.js'
import { isMerged } from '../providers/local/branch-ops.js'
import { normalizeOperationError } from '../git/errors.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { capabilityError } from './guards.js'

/**
 * Resolve a merge target from either an exact branch name or a
 * model/locale/latest selector. Returns the concrete branch, or an error with
 * candidate branches when the selector is ambiguous or matches nothing.
 */
async function resolveMergeBranch(
  git: SimpleGit,
  input: { branch?: string, model?: string, locale?: string, latest?: boolean },
): Promise<{ branch: string } | { error: string, candidates: string[] }> {
  const summary = await git.branchLocal()
  const crBranches = summary.all.filter(b => b.startsWith('cr/') && b !== CONTENTRAIN_BRANCH)

  if (input.branch) {
    if (summary.all.includes(input.branch)) return { branch: input.branch }
    return { error: `Branch "${input.branch}" not found locally.`, candidates: crBranches }
  }

  if (!input.model) {
    return { error: 'Provide either "branch" (exact name) or "model" (to resolve the branch).', candidates: crBranches }
  }

  const prefix = input.locale
    ? `cr/content/${input.model}/${input.locale}/`
    : `cr/content/${input.model}/`
  let matches = crBranches.filter(b => b.startsWith(prefix))
  if (matches.length === 0) {
    // Fall back to any scope whose path contains the model segment (fix/bulk/...)
    matches = crBranches.filter(b => b.split('/').includes(input.model!))
  }
  if (matches.length === 0) {
    return { error: `No pending cr/* branch found for model "${input.model}".`, candidates: crBranches }
  }
  if (matches.length === 1) return { branch: matches[0]! }
  if (!input.latest) {
    return { error: `Multiple branches match model "${input.model}". Pass latest:true or an exact branch.`, candidates: matches }
  }
  const withTimes = await Promise.all(matches.map(async (b) => {
    const t = await git.raw(['log', '-1', '--format=%ct', b]).then(s => Number(s.trim())).catch(() => 0)
    return { b, t }
  }))
  const newest = withTimes.toSorted((left, right) => right.t - left.t)[0]!
  return { branch: newest.b }
}

export function registerWorkflowTools(
  server: McpServer,
  provider: ToolProvider,
  projectRoot: string | undefined,
): void {
  // ─── contentrain_validate ───
  server.tool(
    'contentrain_validate',
    'Validate project content against model schemas. Detects required field violations, type mismatches, broken relations, secret leaks, i18n parity issues, and more. If fix:true, auto-fixes structural issues (canonical sort, orphan meta, missing locale files) — do NOT manually edit .contentrain/ files.',
    {
      model: z.string().optional().describe('Model ID to validate (omit for all models)'),
      fix: z.boolean().optional().describe('Auto-fix structural issues (canonical sort, orphan meta, missing locale files). Default: false'),
    },
    TOOL_ANNOTATIONS['contentrain_validate']!,
    async (input) => {
      // Read-only validate runs over any provider (LocalProvider or remote
      // GitHubProvider). Fix mode still needs a local worktree — it opens a
      // git transaction — so it short-circuits with a capability error when
      // no projectRoot is available.
      if (input.fix && !projectRoot) {
        return capabilityError('contentrain_validate', 'localWorktree')
      }

      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      try {
        let result: Awaited<ReturnType<typeof validateProject>> | undefined

        if (input.fix && projectRoot) {
          // Branch health gate for fix mode (creates a branch)
          const fixHealth = await checkBranchHealth(projectRoot)
          if (fixHealth.blocked) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: fixHealth.message,
                action: 'blocked',
                hint: 'Merge or delete old contentrain/* branches before auto-fixing.',
              }, null, 2) }],
              isError: true,
            }
          }

          // Use git transaction for fixes. Force auto-merge: structural fixes
          // (canonical sort, orphan meta, missing locale files) are cosmetic
          // infra repairs and should land directly on contentrain rather than
          // spawn a pending cr/fix/validate review branch.
          const branch = buildBranchName('fix', 'validate')
          const tx = await createTransaction(projectRoot, branch, { workflowOverride: 'auto-merge' })

          try {
            await tx.write(async (wt) => {
              result = await validateProject(wt, { model: input.model, fix: true })
            })

            if (result!.fixed > 0) {
              await tx.commit(`[contentrain] validate: auto-fix ${result!.fixed} issue(s)`, {
                tool: 'contentrain_validate',
                model: input.model ?? '*',
              })
              const gitResult = await tx.complete()

              const nextSteps: string[] = []
              if (result!.summary.errors > 0) nextSteps.push('Fix remaining errors manually')
              if (result!.summary.warnings > 0) nextSteps.push('Review warnings')
              nextSteps.push('Run contentrain_validate again to verify')

              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  status: 'committed',
                  message: `Validation complete. ${result!.fixed} issue(s) auto-fixed and committed to git. Do NOT manually edit .contentrain/ files.`,
                  ...result!,
                  git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
                  context_updated: true,
                  next_steps: nextSteps,
                }, null, 2) }],
              }
            } else {
              // Nothing to fix, cleanup the branch
              await tx.cleanup()
            }
          } catch (error) {
            await tx.cleanup()
            throw error
          } finally {
            await tx.cleanup()
          }
        }

        // No fix or nothing was fixed — run read-only validation. Prefer the
        // local disk walk when we have a projectRoot (identical behavior to
        // pre-5.5 callers); otherwise drive the reader-based path so remote
        // providers stay supported.
        if (!result) {
          result = projectRoot
            ? await validateProject(projectRoot, { model: input.model, fix: false })
            : await validateProject(provider, { model: input.model, fix: false })
        }

        const nextSteps: string[] = []
        if (result.summary.errors > 0) nextSteps.push('Fix errors in content using contentrain_content_save')
        if (result.summary.warnings > 0) nextSteps.push('Review warnings')
        if (result.valid) nextSteps.push('Run contentrain_submit to push changes')

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'validated',
            message: result.valid
              ? 'All validation checks passed.'
              : `Validation found ${result.summary.errors} error(s) and ${result.summary.warnings} warning(s).`,
            ...result,
            next_steps: nextSteps,
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }
    },
  )

  // ─── contentrain_submit ───
  server.tool(
    'contentrain_submit',
    'Push contentrain/* branches to remote. MCP is push-only — PR creation is handled by the platform. Do NOT manually push or create PRs.',
    {
      branches: z.array(z.string()).optional().describe('Specific branch names to push (omit for all contentrain/* branches)'),
      message: z.string().optional().describe('Optional message for the push operation'),
    },
    TOOL_ANNOTATIONS['contentrain_submit']!,
    async (input) => {
      // Submit pushes a branch to origin via simple-git — needs both a
      // local worktree (to enumerate cr/* branches) and pushRemote
      // (semantic capability name, even though the underlying code is
      // simple-git rather than a provider call).
      if (!provider.capabilities.localWorktree || !provider.capabilities.pushRemote || !projectRoot) {
        return capabilityError('contentrain_submit', 'localWorktree')
      }
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      const git = simpleGit(projectRoot)
      const remoteName = process.env['CONTENTRAIN_REMOTE'] ?? 'origin'

      // Check remote exists
      let hasRemote = false
      try {
        const remotes = await git.getRemotes()
        hasRemote = remotes.some(r => r.name === remoteName)
      } catch {
        hasRemote = false
      }

      if (!hasRemote) {
        const summary = await git.branchLocal().catch(() => ({ all: [] as string[] }))
        const pending = summary.all.filter(b => b.startsWith('cr/') && b !== CONTENTRAIN_BRANCH)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `No remote "${remoteName}" configured — contentrain_submit (push) is unavailable.`,
            stage: 'submit',
            agent_hint: 'This project has no git remote. In a local/solo workflow, land pending review branches with contentrain_merge instead of submit, or set workflow:"auto-merge" in config.json so saves merge locally without a remote.',
            pending_branches: pending,
            next_steps: [
              pending.length > 0
                ? `Merge a pending branch locally: contentrain_merge { branch: "${pending[0]}", confirm: true }`
                : 'Make changes with contentrain_content_save — auto-merge lands them locally without a remote',
              `Or add a remote to enable submit: git remote add ${remoteName} <url>`,
            ],
          }, null, 2) }],
          isError: true,
        }
      }

      try {
        // Determine the base branch for merge-status checks
        const baseBranch = config.repository?.default_branch
          ?? process.env['CONTENTRAIN_BRANCH']
          ?? ((await git.raw(['branch', '--show-current'])).trim() || 'main')

        // Get contentrain branches
        const branchSummary = await git.branchLocal()

        // Get branches NOT yet merged into base (only these need pushing)
        let unmergedRaw = ''
        try {
          unmergedRaw = await git.raw(['branch', '--no-merged', baseBranch])
        } catch {
          // If base branch doesn't exist yet, treat all as unmerged
          unmergedRaw = branchSummary.all.join('\n')
        }
        const unmergedSet = new Set(
          unmergedRaw.split('\n').map(b => b.replace(/^\*?\s+/, '').trim()).filter(Boolean),
        )

        let branchesToPush: string[]

        if (input.branches && input.branches.length > 0) {
          branchesToPush = input.branches.filter(b => branchSummary.all.includes(b))
          const missing = input.branches.filter(b => !branchSummary.all.includes(b))
          if (missing.length > 0) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Branches not found: ${missing.join(', ')}`,
              }) }],
              isError: true,
            }
          }
          // Filter out already-merged branches from explicit list
          branchesToPush = branchesToPush.filter(b => unmergedSet.has(b))
        } else {
          branchesToPush = branchSummary.all.filter(b => b.startsWith('cr/') && unmergedSet.has(b))
        }

        if (branchesToPush.length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'No unmerged cr/* branches found to push.',
              next_steps: ['Make changes first with contentrain_content_save or contentrain_model_save'],
            }) }],
            isError: true,
          }
        }

        // Push each branch
        const pushed: string[] = []
        const errors: Array<{ branch: string; error: string }> = []

        for (const branch of branchesToPush) {
          try {
            await git.push(remoteName, branch)
            pushed.push(branch)
          } catch (error) {
            errors.push({
              branch,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        // Best-effort: push the contentrain branch itself
        try {
          await git.push(remoteName, CONTENTRAIN_BRANCH)
        } catch {
          // contentrain branch push is best-effort
        }

        // Lazy cleanup: delete merged branches after push
        const cleanup = await cleanupMergedBranches(projectRoot)

        // Lazy remote sweep: prune already-merged cr/* leftovers on the
        // remote (capped, config-gated, never throws) so review workflows
        // self-heal instead of accumulating phantom pending reviews.
        const remotePrune = await pruneMergedRemoteBranches(projectRoot, { config, max: 20 })

        const nextSteps: string[] = []
        if (pushed.length > 0) nextSteps.push('Create PRs on your git platform for review')
        if (pushed.length > 0) nextSteps.push('For merge: use contentrain_merge or direct user to http://localhost:3333/branches')
        if (errors.length > 0) nextSteps.push('Fix push errors and retry')
        if (remotePrune.errors.length > 0) nextSteps.push('Some merged remote branches could not be pruned — run `contentrain prune`')
        if (cleanup.remaining >= 50) nextSteps.push(`Warning: ${cleanup.remaining} active contentrain branches. Consider reviewing old branches.`)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: `Pushed ${pushed.length} branch(es) to ${remoteName}.`,
            pushed,
            errors: errors.length > 0 ? errors : undefined,
            remote: remoteName,
            cleanup: cleanup.deleted > 0 ? { deleted: cleanup.deleted, remaining: cleanup.remaining } : undefined,
            remote_cleanup: remotePrune.deleted.length > 0 ? { deleted: remotePrune.deleted.length } : undefined,
            next_steps: nextSteps,
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Submit failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }
    },
  )

  // ─── contentrain_merge ───
  server.tool(
    'contentrain_merge',
    'Merge a review-mode branch into contentrain. Local git operation — no external platform needed. Merges the feature branch into the contentrain branch, advances the base branch via update-ref, selectively syncs .contentrain/ files to the working tree, and prunes the merged branch. Target by exact "branch" name, or resolve by "model" (+ optional "locale"/"latest").',
    {
      branch: z.string().optional().describe('Exact branch name to merge (e.g. cr/content/blog-post/...). Omit to resolve by model.'),
      model: z.string().optional().describe('Resolve the branch by model id (e.g. "blog-post").'),
      locale: z.string().optional().describe('Narrow model resolution to a locale.'),
      latest: z.boolean().optional().describe('When multiple branches match the model, merge the most recently committed one.'),
      confirm: z.literal(true).describe('Must be true to confirm the merge'),
    },
    TOOL_ANNOTATIONS['contentrain_merge']!,
    async (input) => {
      // Merge runs a local git transaction (worktree + update-ref +
      // selective sync). Remote providers do not expose this today; use
      // provider.mergeBranch directly from a Studio-style driver instead.
      if (!provider.capabilities.localWorktree || !projectRoot) {
        return capabilityError('contentrain_merge', 'localWorktree')
      }
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      try {
        // Resolve the target branch from exact name or model/locale/latest selector
        const git = simpleGit(projectRoot)
        const resolved = await resolveMergeBranch(git, input)
        if ('error' in resolved) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: resolved.error,
              candidates: resolved.candidates,
              next_steps: [
                'Pass an exact { branch } or { model, latest: true }',
                'List pending branches with contentrain_branch_list',
              ],
            }, null, 2) }],
            isError: true,
          }
        }
        const targetBranch = resolved.branch

        const result = await mergeBranch(projectRoot, targetBranch)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'merged',
            branch: targetBranch,
            action: result.action,
            commit: result.commit,
            sync: result.sync,
            ...(result.remote ? { remote: result.remote } : {}),
            next_steps: [
              'Run `contentrain generate` (or `npx contentrain-query generate`) to update the SDK client',
              'Run contentrain_validate to verify content integrity',
              result.sync.skipped.length > 0
                ? `${result.sync.skipped.length} file(s) skipped due to local changes — resolve manually`
                : '',
              result.remote?.warning
                ? `Remote copy not deleted (${result.remote.warning}) — delete it manually: git push <remote> --delete ${targetBranch}`
                : '',
            ].filter(Boolean),
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(normalizeOperationError(error, 'merge'), null, 2) }],
          isError: true,
        }
      }
    },
  )

  // ─── contentrain_branch_list ───
  server.tool(
    'contentrain_branch_list',
    'List pending contentrain (cr/*) branches with their merge status against the contentrain branch. Use this to discover branch names for contentrain_merge / contentrain_branch_delete, and to monitor branch-health limits (warning at 50, blocked at 80 unmerged).',
    {
      unmerged_only: z.boolean().optional().describe('Only list branches not yet merged into contentrain. Default: false'),
      remote: z.boolean().optional().describe('Also check the git remote: annotate entries with on_remote and report remote-only cr/* leftovers. Requires network. Default: false'),
    },
    TOOL_ANNOTATIONS['contentrain_branch_list']!,
    async (input) => {
      if (!provider.capabilities.localWorktree || !projectRoot) {
        return capabilityError('contentrain_branch_list', 'localWorktree')
      }
      try {
        const git = simpleGit(projectRoot)
        const summary = await git.branchLocal()
        const crBranches = summary.all.filter(b => b.startsWith('cr/') && b !== CONTENTRAIN_BRANCH)

        const remoteList = input.remote ? await listRemoteCrBranches(projectRoot) : undefined
        const remoteNames = remoteList && !remoteList.error
          ? new Set(remoteList.branches.map(b => b.name))
          : undefined

        const branches = await Promise.all(crBranches.map(async (name) => {
          const [merged, ts] = await Promise.all([
            isMerged(projectRoot, name, CONTENTRAIN_BRANCH),
            git.raw(['log', '-1', '--format=%cI', name]).then(s => s.trim()).catch(() => ''),
          ])
          return {
            name,
            sha: summary.branches[name]?.commit ?? '',
            merged,
            lastCommit: ts,
            ...(remoteNames ? { on_remote: remoteNames.has(name) } : {}),
          }
        }))
        const ordered = branches.toSorted((left, right) => right.lastCommit.localeCompare(left.lastCommit))
        const filtered = input.unmerged_only ? ordered.filter(b => !b.merged) : ordered
        const health = await checkBranchHealth(projectRoot)

        const localNames = new Set(crBranches)
        const remoteExtras = input.remote
          ? (remoteList === null
              ? { remote_error: 'No git remote configured.' }
              : remoteList!.error
                ? { remote_error: remoteList!.error }
                : { remote_only: remoteList!.branches.filter(b => !localNames.has(b.name)).map(b => b.name) })
          : {}

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            total: ordered.length,
            unmerged: ordered.filter(b => !b.merged).length,
            branches: filtered,
            ...remoteExtras,
            health: { warning: health.warning, blocked: health.blocked, message: health.message },
            next_steps: [
              'Merge a branch: contentrain_merge { branch: "...", confirm: true }',
              'Delete a stale branch: contentrain_branch_delete { branch: "...", confirm: true }',
            ],
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(normalizeOperationError(error, 'branch_list'), null, 2) }],
          isError: true,
        }
      }
    },
  )

  // ─── contentrain_branch_delete ───
  server.tool(
    'contentrain_branch_delete',
    'Delete a pending contentrain (cr/*) branch that will not be merged — e.g. a branch left behind by a failed operation, or a superseded draft. Only cr/* branches can be deleted; the contentrain branch is protected. This is destructive: the branch and its unmerged commits are removed.',
    {
      branch: z.string().describe('The cr/* branch to delete'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    TOOL_ANNOTATIONS['contentrain_branch_delete']!,
    async (input) => {
      if (!provider.capabilities.localWorktree || !projectRoot) {
        return capabilityError('contentrain_branch_delete', 'localWorktree')
      }
      if (!input.branch.startsWith('cr/') || input.branch === CONTENTRAIN_BRANCH) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Refusing to delete "${input.branch}". Only cr/* feature branches can be deleted (the contentrain branch is protected).`,
          }) }],
          isError: true,
        }
      }
      try {
        const git = simpleGit(projectRoot)
        const summary = await git.branchLocal()
        if (!summary.all.includes(input.branch)) {
          // The local copy may already be pruned while the pushed copy
          // leaked on the remote — attempt a remote-only delete before
          // giving up.
          const remoteOnly = await deleteRemoteBranch(projectRoot, input.branch)
          if (remoteOnly.deleted) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                status: 'deleted',
                branch: input.branch,
                scope: 'remote-only',
                message: 'Branch was not present locally; its remote copy was deleted.',
              }, null, 2) }],
            }
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: `Branch "${input.branch}" not found locally${remoteOnly.skipped === 'not-found' ? ' or on the remote' : ''}.`,
              ...(remoteOnly.warning ? { remote_warning: remoteOnly.warning } : {}),
              next_steps: ['List branches with contentrain_branch_list'],
            }) }],
            isError: true,
          }
        }
        const merged = await isMerged(projectRoot, input.branch, CONTENTRAIN_BRANCH)
        // Force-delete (-D): the branch may carry unmerged commits the caller
        // has explicitly decided to discard.
        await git.raw(['branch', '-D', input.branch])
        // Delete the pushed copy too — a discarded draft must not linger on
        // the remote as a phantom pending review. Best-effort, config-gated.
        const remote = await deleteRemoteBranch(projectRoot, input.branch)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'deleted',
            branch: input.branch,
            was_merged: merged,
            remote_deleted: remote.deleted,
            ...(remote.skipped ? { remote_skipped: remote.skipped } : {}),
            ...(remote.warning ? { remote_warning: remote.warning } : {}),
            warning: merged ? undefined : 'Branch was not merged — its commits were discarded.',
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(normalizeOperationError(error, 'branch_delete'), null, 2) }],
          isError: true,
        }
      }
    },
  )
}
