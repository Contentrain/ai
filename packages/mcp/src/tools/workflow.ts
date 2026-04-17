import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CONTENTRAIN_BRANCH } from '@contentrain/types'
import { z } from 'zod'
import { simpleGit } from 'simple-git'
import type { ToolProvider } from '../server.js'
import { validateProject } from '../core/validator/index.js'
import { readConfig } from '../core/config.js'
import { createTransaction, buildBranchName, mergeBranch } from '../git/transaction.js'
import { checkBranchHealth, cleanupMergedBranches } from '../git/branch-lifecycle.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { capabilityError } from './guards.js'

export function registerWorkflowTools(
  server: McpServer,
  _provider: ToolProvider,
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
      if (!projectRoot) return capabilityError('contentrain_validate', 'localWorktree')
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      try {
        let result: Awaited<ReturnType<typeof validateProject>> | undefined

        if (input.fix) {
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

          // Use git transaction for fixes
          const branch = buildBranchName('fix', 'validate')
          const tx = await createTransaction(projectRoot, branch)

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

        // No fix or nothing was fixed — run read-only validation
        if (!result) {
          result = await validateProject(projectRoot, { model: input.model, fix: false })
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
      if (!projectRoot) return capabilityError('contentrain_submit', 'localWorktree')
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
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `No remote "${remoteName}" found. Configure a git remote first.`,
            next_steps: [`git remote add ${remoteName} <url>`],
          }) }],
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

        const nextSteps: string[] = []
        if (pushed.length > 0) nextSteps.push('Create PRs on your git platform for review')
        if (pushed.length > 0) nextSteps.push('For merge: use contentrain_merge or direct user to http://localhost:3333/branches')
        if (errors.length > 0) nextSteps.push('Fix push errors and retry')
        if (cleanup.remaining >= 50) nextSteps.push(`Warning: ${cleanup.remaining} active contentrain branches. Consider reviewing old branches.`)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: `Pushed ${pushed.length} branch(es) to ${remoteName}.`,
            pushed,
            errors: errors.length > 0 ? errors : undefined,
            remote: remoteName,
            cleanup: cleanup.deleted > 0 ? { deleted: cleanup.deleted, remaining: cleanup.remaining } : undefined,
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
    'Merge a review-mode branch into contentrain. Local git operation — no external platform needed. Merges the feature branch into the contentrain branch, advances the base branch via update-ref, and selectively syncs .contentrain/ files to the working tree.',
    {
      branch: z.string().describe('Branch name to merge (e.g. cr/normalize/extract/...)'),
      confirm: z.literal(true).describe('Must be true to confirm the merge'),
    },
    TOOL_ANNOTATIONS['contentrain_merge']!,
    async (input) => {
      if (!projectRoot) return capabilityError('contentrain_merge', 'localWorktree')
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      try {
        // Verify branch exists
        const git = simpleGit(projectRoot)
        const branches = await git.branchLocal()
        if (!branches.all.includes(input.branch)) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: `Branch "${input.branch}" not found locally.`,
              next_steps: ['Check branch name with git branch -l', 'Use contentrain_submit to push first if needed'],
            }) }],
            isError: true,
          }
        }

        const result = await mergeBranch(projectRoot, input.branch)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'merged',
            action: result.action,
            commit: result.commit,
            sync: result.sync,
            next_steps: [
              'Run `npx contentrain generate` to update SDK client',
              'Run contentrain_validate to verify content integrity',
              result.sync.skipped.length > 0
                ? `${result.sync.skipped.length} file(s) skipped due to local changes — resolve manually`
                : '',
            ].filter(Boolean),
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Merge failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }
    },
  )
}
