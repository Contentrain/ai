import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { EntryMeta } from '@contentrain/types'
import { z } from 'zod'
import { readConfig } from '../core/config.js'
import { readModel } from '../core/model-manager.js'
import { resolveContentDir, resolveJsonFilePath, deleteContent } from '../core/content-manager.js'
import { readMeta, writeMeta } from '../core/meta-manager.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'
import { readJson, writeJson } from '../util/fs.js'

export function registerBulkTools(server: McpServer, projectRoot: string): void {
  server.tool(
    'contentrain_bulk',
    'Batch operations on content entries. All operations are auto-committed to git.',
    {
      operation: z.enum(['copy_locale', 'update_status', 'delete_entries']),
      model: z.string().describe('Model ID'),
      source_locale: z.string().optional().describe('Source locale for copy_locale operation'),
      target_locale: z.string().optional().describe('Target locale for copy_locale operation'),
      entry_ids: z.array(z.string()).optional().describe('Entry IDs for update_status or delete_entries'),
      status: z.enum(['draft', 'in_review', 'published', 'rejected', 'archived']).optional().describe('New status for update_status'),
      confirm: z.boolean().optional().describe('Must be true for delete_entries'),
    },
    async (input) => {
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
            hint: 'Merge or delete old contentrain/* branches before creating new ones.',
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

            await tx.write(async (wt) => {
              const cDir = resolveContentDir(wt, model)
              const sourceFile = resolveJsonFilePath(cDir, model, input.source_locale!)
              const targetFile = resolveJsonFilePath(cDir, model, input.target_locale!)

              const sourceData = await readJson<Record<string, unknown>>(sourceFile)
              if (!sourceData) {
                throw new Error(`No content found for locale "${input.source_locale}" in model "${input.model}"`)
              }

              await writeJson(targetFile, sourceData)

              if (model.kind === 'collection') {
                const entries = sourceData as Record<string, Record<string, unknown>>
                const entryIds = Object.keys(entries)
                const metaOps = entryIds.map(entryId =>
                  writeMeta(wt, model, { locale: input.target_locale!, entryId }, {
                    status: 'draft',
                    source: 'agent',
                    updated_by: 'contentrain-mcp',
                  }),
                )
                await Promise.all(metaOps)
                copiedCount = entryIds.length
              } else {
                await writeMeta(wt, model, { locale: input.target_locale! }, {
                  status: 'draft',
                  source: 'agent',
                  updated_by: 'contentrain-mcp',
                })
                copiedCount = 1
              }

            })

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
                git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
                context_updated: true,
              }, null, 2) }],
            }
          } catch (error) {
            await tx.cleanup()
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `copy_locale failed: ${error instanceof Error ? error.message : String(error)}`,
              }) }],
              isError: true,
            }
          } finally {
            await tx.cleanup()
          }
        }

        case 'update_status': {
          if (!input.entry_ids || input.entry_ids.length === 0) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'update_status requires entry_ids' }) }],
              isError: true,
            }
          }
          if (!input.status) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'update_status requires status' }) }],
              isError: true,
            }
          }

          if (model.kind !== 'collection') {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'update_status with entry_ids is only supported for collection models' }) }],
              isError: true,
            }
          }

          const branch = buildBranchName('bulk', input.model)
          const tx = await createTransaction(projectRoot, branch)

          try {
            let updatedCount = 0
            const notFound: string[] = []

            await tx.write(async (wt) => {
              for (const locale of config.locales.supported) {
                const metaData = await readMeta(wt, model, { locale }) as Record<string, EntryMeta> | null

                const updateOps: Array<Promise<void>> = []
                for (const entryId of input.entry_ids!) {
                  const existing = metaData?.[entryId]
                  if (existing) {
                    updateOps.push(writeMeta(wt, model, { locale, entryId }, {
                      ...existing,
                      status: input.status!,
                      updated_by: 'contentrain-mcp',
                    }))
                    updatedCount++
                  } else if (locale === config.locales.default) {
                    notFound.push(entryId)
                  }
                }
                await Promise.all(updateOps)
              }

            })

            await tx.commit(`[contentrain] bulk: update status → ${input.status} for ${input.model}`, {
              tool: 'contentrain_bulk',
              model: input.model,
              entries: input.entry_ids!,
            })
            const gitResult = await tx.complete()

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                status: 'committed',
                operation: 'update_status',
                message: `Updated ${updatedCount} meta entries to status "${input.status}".`,
                updated: updatedCount,
                not_found: notFound.length > 0 ? notFound : undefined,
                git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
                context_updated: true,
              }, null, 2) }],
            }
          } catch (error) {
            await tx.cleanup()
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `update_status failed: ${error instanceof Error ? error.message : String(error)}`,
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
          if (input.confirm !== true) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'delete_entries requires confirm:true' }) }],
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
                const removed = await deleteContent(wt, model, { id: entryId })
                allRemoved.push(...removed)
              }

            })

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
                git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
                context_updated: true,
              }, null, 2) }],
            }
          } catch (error) {
            await tx.cleanup()
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `delete_entries failed: ${error instanceof Error ? error.message : String(error)}`,
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
