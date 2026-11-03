import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { EntryMeta } from '@contentrain/types'
import { z } from 'zod'
import type { ToolProvider } from '../server.js'
import { readConfig } from '../core/config.js'
import { readModel } from '../core/model-manager.js'
import { resolveContentDir, resolveJsonFilePath, deleteContent } from '../core/content-manager.js'
import { mergeEntryMeta, writeMeta, writeMetaEntries } from '../core/meta-manager.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'
import { normalizeOperationError } from '../git/errors.js'
import { readJson, writeJson } from '../util/fs.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { capabilityError } from './guards.js'
import { divergenceNextSteps, gitReport } from './commit-plan.js'

export function registerBulkTools(
  server: McpServer,
  _provider: ToolProvider,
  projectRoot: string | undefined,
): void {
  server.tool(
    'contentrain_bulk',
    'Batch operations on content entries: copy a locale, or delete many collection entries. All operations are auto-committed to git. '
    + 'To publish or change status, use contentrain_content_status. '
    + 'DRY RUN (dry_run:true): runs the whole operation in a throwaway worktree and reports exactly what would change — nothing is committed and no branch survives. '
    + 'Recommended workflow: preview with dry_run:true, review the counts, then call again to execute.',
    {
      operation: z.enum(['copy_locale', 'delete_entries']),
      model: z.string().describe('Model ID'),
      source_locale: z.string().optional().describe('Source locale for copy_locale operation'),
      target_locale: z.string().optional().describe('Target locale for copy_locale operation'),
      entry_ids: z.array(z.string()).optional().describe('Entry IDs for delete_entries (collection models)'),
      confirm: z.boolean().optional().describe('Must be true for delete_entries (not needed while dry_run:true — a preview deletes nothing)'),
      dry_run: z.boolean().optional().describe('Preview mode: perform the operation in a throwaway worktree and report what would change, committing nothing. Defaults to false so existing callers keep executing.'),
    },
    TOOL_ANNOTATIONS['contentrain_bulk']!,
    async (input) => {
      if (!projectRoot) return capabilityError('contentrain_bulk', 'localWorktree')
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      const model = await readModel(projectRoot, input.model)
      if (!model) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Model "${input.model}" not found` }) }],
          isError: true,
        }
      }

      // Branch health gate
      const health = await checkBranchHealth(projectRoot)
      if (health.blocked) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: health.message,
            action: 'blocked',
            hint: 'Merge or delete old cr/* branches before creating new ones.',
          }, null, 2) }],
          isError: true,
        }
      }

      switch (input.operation) {
        case 'copy_locale': {
          if (!input.source_locale || !input.target_locale) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'copy_locale requires source_locale and target_locale' }) }],
              isError: true,
            }
          }
          if (!config.locales.supported.includes(input.source_locale)) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Source locale "${input.source_locale}" is not supported. Supported: [${config.locales.supported.join(', ')}]`,
              }) }],
              isError: true,
            }
          }
          if (!config.locales.supported.includes(input.target_locale)) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Target locale "${input.target_locale}" is not supported. Supported: [${config.locales.supported.join(', ')}]`,
              }) }],
              isError: true,
            }
          }

          // Guard: copy_locale requires i18n model — non-i18n models use data.json for all locales
          if (!model.i18n) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Model "${input.model}" has i18n disabled. copy_locale only works with i18n-enabled models. Enable i18n first with contentrain_model_save.`,
              }) }],
              isError: true,
            }
          }

          if (model.kind !== 'collection' && model.kind !== 'singleton' && model.kind !== 'dictionary') {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'copy_locale is only supported for collection, singleton, and dictionary models' }) }],
              isError: true,
            }
          }

          const branch = buildBranchName('bulk', input.model, input.target_locale)
          const tx = await createTransaction(projectRoot, branch)

          try {
            let copiedCount = 0
            // Copying REPLACES the target locale file. A preview that does not
            // say how many records are already there hides the only thing worth
            // previewing about this operation.
            let replacedCount = 0

            await tx.write(async (wt) => {
              const cDir = resolveContentDir(wt, model)
              const sourceFile = resolveJsonFilePath(cDir, model, input.source_locale!)
              const targetFile = resolveJsonFilePath(cDir, model, input.target_locale!)

              const sourceData = await readJson<Record<string, unknown>>(sourceFile)
              if (!sourceData) {
                throw new Error(`No content found for locale "${input.source_locale}" in model "${input.model}"`)
              }
              const targetData = await readJson<Record<string, unknown>>(targetFile)
              if (targetData) replacedCount = model.kind === 'collection' ? Object.keys(targetData).length : 1

              await writeJson(targetFile, sourceData)

              if (model.kind === 'collection') {
                const entries = sourceData as Record<string, Record<string, unknown>>
                const updates: Record<string, EntryMeta> = {}
                for (const entryId of Object.keys(entries)) {
                  // A copied entry is a new entry in the target locale.
                  updates[entryId] = mergeEntryMeta(undefined)
                }
                // One read-modify-write for the whole locale file — see writeMetaEntries.
                const written = await writeMetaEntries(wt, model, { locale: input.target_locale!, defaultLocale: config.locales.default }, updates)
                copiedCount = written.length
              } else {
                await writeMeta(wt, model, { locale: input.target_locale!, defaultLocale: config.locales.default }, mergeEntryMeta(undefined))
                copiedCount = 1
              }

            })

            if (input.dry_run) {
              await tx.cleanup()
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  status: 'preview',
                  dry_run: true,
                  operation: 'copy_locale',
                  message: `Would copy ${copiedCount} entries from ${input.source_locale} to ${input.target_locale}.`,
                  would_copy: copiedCount,
                  would_replace: replacedCount,
                  next_steps: replacedCount > 0
                    ? [
                        `${replacedCount} record(s) already exist in "${input.target_locale}" and would be REPLACED — confirm that is intended`,
                        'Call contentrain_bulk again without dry_run to execute',
                      ]
                    : ['Call contentrain_bulk again without dry_run to execute'],
                }, null, 2) }],
              }
            }

            await tx.commit(`[contentrain] bulk: copy ${input.source_locale} → ${input.target_locale} for ${input.model}`, {
              tool: 'contentrain_bulk',
              model: input.model,
              locale: input.target_locale!,
            })
            const gitResult = await tx.complete()

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                status: 'committed',
                operation: 'copy_locale',
                message: `Copied ${copiedCount} entries from ${input.source_locale} to ${input.target_locale}.`,
                copied: copiedCount,
                git: gitReport({ branch, action: gitResult.action, commit: gitResult.commit, sync: gitResult.sync, base_advance: gitResult.base_advance, remote_push: gitResult.remote_push, base_branch: gitResult.base_branch }),
                ...(gitResult.warning ? { warning: gitResult.warning } : {}),
                ...(divergenceNextSteps(gitResult).length > 0 ? { next_steps: divergenceNextSteps(gitResult) } : {}),
                context_updated: true,
              }, null, 2) }],
            }
          } catch (error) {
            await tx.cleanup()
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                ...normalizeOperationError(error, 'bulk_copy_locale'),
              }) }],
              isError: true,
            }
          } finally {
            await tx.cleanup()
          }
        }

        case 'delete_entries': {
          if (!input.entry_ids || input.entry_ids.length === 0) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'delete_entries requires entry_ids' }) }],
              isError: true,
            }
          }
          // A preview deletes nothing, so demanding confirmation for it would
          // make the safe path the harder one.
          if (!input.dry_run && input.confirm !== true) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: 'delete_entries requires confirm:true',
                hint: 'Run with dry_run:true first to see which files would be removed — no confirmation needed for a preview.',
              }) }],
              isError: true,
            }
          }

          if (model.kind !== 'collection') {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'delete_entries with entry_ids is only supported for collection models' }) }],
              isError: true,
            }
          }

          const branch = buildBranchName('bulk', input.model)
          const tx = await createTransaction(projectRoot, branch)

          try {
            const allRemoved: string[] = []

            await tx.write(async (wt) => {
              for (const entryId of input.entry_ids!) {
                const removed = await deleteContent(wt, model, { id: entryId, defaultLocale: config.locales.default })
                allRemoved.push(...removed)
              }

            })

            if (input.dry_run) {
              await tx.cleanup()
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  status: 'preview',
                  dry_run: true,
                  operation: 'delete_entries',
                  message: `Would delete ${input.entry_ids!.length} entries, removing ${allRemoved.length} file(s).`,
                  would_delete: input.entry_ids!.length,
                  files_to_remove: allRemoved,
                  next_steps: ['Call contentrain_bulk again with dry_run:false and confirm:true to execute'],
                }, null, 2) }],
              }
            }

            await tx.commit(`[contentrain] bulk: delete ${input.entry_ids.length} entries from ${input.model}`, {
              tool: 'contentrain_bulk',
              model: input.model,
              entries: input.entry_ids!,
            })
            const gitResult = await tx.complete()

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                status: 'committed',
                operation: 'delete_entries',
                message: `Deleted ${input.entry_ids.length} entries.`,
                deleted: input.entry_ids.length,
                files_removed: allRemoved,
                git: gitReport({ branch, action: gitResult.action, commit: gitResult.commit, sync: gitResult.sync, base_advance: gitResult.base_advance, remote_push: gitResult.remote_push, base_branch: gitResult.base_branch }),
                ...(gitResult.warning ? { warning: gitResult.warning } : {}),
                ...(divergenceNextSteps(gitResult).length > 0 ? { next_steps: divergenceNextSteps(gitResult) } : {}),
                context_updated: true,
              }, null, 2) }],
            }
          } catch (error) {
            await tx.cleanup()
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                ...normalizeOperationError(error, 'bulk_delete_entries'),
              }) }],
              isError: true,
            }
          } finally {
            await tx.cleanup()
          }
        }

        default: {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: `Unknown operation: ${input.operation}` }) }],
            isError: true,
          }
        }
      }
    },
  )
}
