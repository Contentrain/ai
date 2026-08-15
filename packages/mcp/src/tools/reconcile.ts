import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ConflictResolution } from '@contentrain/types'
import type { ToolProvider } from '../server.js'
import { readConfig } from '../core/config.js'
import { reconcileBranches } from '../git/reconcile.js'
import { normalizeOperationError } from '../git/errors.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { capabilityError } from './guards.js'

const resolutionSchema = z.union([
  z.object({
    id: z.string().describe('Conflict id from a previous dry-run'),
    choose: z.enum(['ours', 'theirs']).describe('Take the contentrain side (ours) or the base-branch side (theirs)'),
  }),
  z.object({
    id: z.string().describe('Conflict id from a previous dry-run'),
    value: z.unknown().describe('Hand-authored replacement value'),
  }),
])

export function registerReconcileTools(
  server: McpServer,
  provider: ToolProvider,
  projectRoot: string | undefined,
): void {
  server.tool(
    'contentrain_reconcile',
    'Reconcile a diverged contentrain ↔ base-branch pair with a content-aware three-way merge. '
    + 'DRY RUN (default, dry_run:true): reports what would merge and which conflicts need a decision — touches nothing. '
    + 'EXECUTE (dry_run:false): performs the merge as a two-parent commit on contentrain and fast-forwards the base branch. '
    + 'Everything one side changed merges mechanically (entry-, key-, term+locale-level); only the same item changed differently '
    + 'on both sides becomes a conflict. Answer conflicts by passing resolutions (from the dry-run ids) and running again — '
    + 'a resolution whose values changed since the dry-run is dropped and the conflict re-reported. '
    + 'Recommended workflow: always run dry_run first, review the summary and conflicts, then execute.',
    {
      dry_run: z.boolean().optional().default(true).describe('Defaults to preview mode (dry_run:true). Set dry_run:false to execute after reviewing the preview.'),
      resolutions: z.array(resolutionSchema).optional().describe('Decisions for conflicts reported by a previous dry-run, matched by id'),
    },
    TOOL_ANNOTATIONS['contentrain_reconcile']!,
    async (input) => {
      if (!provider.capabilities.localWorktree || !projectRoot) {
        return capabilityError('contentrain_reconcile', 'localWorktree')
      }
      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      try {
        const result = await reconcileBranches(projectRoot, {
          dryRun: input.dry_run,
          resolutions: input.resolutions as ConflictResolution[] | undefined,
          source: 'mcp-local',
        })

        if (result.action === 'in_sync') {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              status: 'in_sync',
              message: `"${result.base}" is already contained in the contentrain branch — nothing to reconcile.`,
              base: result.base,
            }, null, 2) }],
          }
        }

        if (result.action === 'preview') {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              status: 'preview',
              dry_run: true,
              base: result.base,
              merge_base: result.merge_base,
              summary: result.plan.result,
              changes: result.plan.changes.map(c => ({ path: c.path, action: c.content === null ? 'delete' : 'write' })),
              conflicts: result.plan.conflicts,
              ...(result.plan.advisories.length > 0 ? { advisories: result.plan.advisories } : {}),
              next_steps: result.plan.conflicts.length > 0
                ? [
                    `${result.plan.conflicts.length} conflict(s) need a decision — collect resolutions ({ id, choose: 'ours'|'theirs' } or { id, value }) and call contentrain_reconcile again`,
                    'Conflicts are content decisions: ask the editor/user, do not guess',
                  ]
                : ['Plan is clean — run contentrain_reconcile with dry_run:false to execute'],
            }, null, 2) }],
          }
        }

        if (result.action === 'conflicts') {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              status: 'conflicts',
              message: `${result.plan.conflicts.length} conflict(s) remain — nothing was written.`,
              base: result.base,
              conflicts: result.plan.conflicts,
              ...(result.plan.advisories.length > 0 ? { advisories: result.plan.advisories } : {}),
              agent_hint: 'Each conflict is a content decision. Ask the editor/user which side (or value) should win, then pass resolutions and run again.',
            }, null, 2) }],
          }
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'reconciled',
            message: `Merged "${result.base}" into the contentrain branch and fast-forwarded "${result.base}".`,
            base: result.base,
            commit: result.commit,
            base_advance: result.base_advance,
            ...(result.remote_push ? { remote_push: result.remote_push } : {}),
            ...(result.sync ? { sync: result.sync } : {}),
            summary: result.plan.result,
            ...(result.plan.advisories.length > 0 ? { advisories: result.plan.advisories } : {}),
            next_steps: [
              'Run contentrain_validate to verify content integrity',
              'Run `contentrain generate` to refresh the SDK client',
            ],
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(normalizeOperationError(error, 'reconcile'), null, 2) }],
          isError: true,
        }
      }
    },
  )
}
