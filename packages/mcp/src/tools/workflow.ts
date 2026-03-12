import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { simpleGit } from 'simple-git'
import { validateProject } from '../core/validator.js'
import { writeContext } from '../core/context.js'
import { readConfig } from '../core/config.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'

export function registerWorkflowTools(server: McpServer, projectRoot: string): void {
  // ─── contentrain_validate ───
  server.tool(
    'contentrain_validate',
    'Validate project content against model schemas. Detects required field violations, type mismatches, broken relations, secret leaks, i18n parity issues, and more. If fix:true, auto-fixes structural issues (canonical sort, orphan meta, missing locale files) — do NOT manually edit .contentrain/ files.',
    {
      model: z.string().optional().describe('Model ID to validate (omit for all models)'),
      fix: z.boolean().optional().describe('Auto-fix structural issues (canonical sort, orphan meta, missing locale files). Default: false'),
    },
    async (input) => {
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
          // Use git transaction for fixes
          const branch = buildBranchName('fix', 'validate')
          const tx = await createTransaction(projectRoot, branch)

          try {
            await tx.write(async (wt) => {
              result = await validateProject(wt, { model: input.model, fix: true })
            })

            if (result!.fixed > 0) {
              await tx.commit(`[contentrain] validate: auto-fix ${result!.fixed} issue(s)`)
              const gitResult = await tx.complete()

              await writeContext(projectRoot, {
                tool: 'contentrain_validate',
                model: input.model ?? '*',
              })

              const nextSteps: string[] = []
              if (result!.summary.errors > 0) nextSteps.push('Fix remaining errors manually')
              if (result!.summary.warnings > 0) nextSteps.push('Review warnings')
              nextSteps.push('Run contentrain_validate again to verify')

              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  status: 'committed',
                  message: `Validation complete. ${result!.fixed} issue(s) auto-fixed and committed to git. Do NOT manually edit .contentrain/ files.`,
                  ...result!,
                  git: { branch, action: gitResult.action, commit: gitResult.commit },
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
    async (input) => {
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
        // Get contentrain branches
        const branchSummary = await git.branchLocal()
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
        } else {
          branchesToPush = branchSummary.all.filter(b => b.startsWith('contentrain/'))
        }

        if (branchesToPush.length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: 'No contentrain/* branches found to push.',
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

        await writeContext(projectRoot, {
          tool: 'contentrain_submit',
          model: '*',
        })

        const nextSteps: string[] = []
        if (pushed.length > 0) nextSteps.push('Create PRs on your git platform for review')
        if (errors.length > 0) nextSteps.push('Fix push errors and retry')

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: `Pushed ${pushed.length} branch(es) to ${remoteName}.`,
            pushed,
            errors: errors.length > 0 ? errors : undefined,
            remote: remoteName,
            context_updated: true,
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
}
