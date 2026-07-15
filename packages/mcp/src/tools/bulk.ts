import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { EntryMeta } from '@contentrain/types'
import { z } from 'zod'
import type { ToolProvider } from '../server.js'
import { readConfig } from '../core/config.js'
import { readModel } from '../core/model-manager.js'
import { resolveContentDir, resolveJsonFilePath, deleteContent } from '../core/content-manager.js'
import { readMeta, writeMeta, writeMetaEntries } from '../core/meta-manager.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'
import { normalizeOperationError } from '../git/errors.js'
import { readJson, writeJson } from '../util/fs.js'
import { TOOL_ANNOTATIONS } from './annotations.js'
import { capabilityError } from './guards.js'

export function registerBulkTools(
  server: McpServer,
  _provider: ToolProvider,
  projectRoot: string | undefined,
): void {
  server.tool(
    'contentrain_bulk',
    'Batch operations on content entries. All operations are auto-committed to git.',
    {
      operation: z.enum(['copy_locale', 'update_status', 'delete_entries']),
      model: z.string().describe('Model ID'),
      source_locale: z.string().optional().describe('Source locale for copy_locale operation'),
      target_locale: z.string().optional().describe('Target locale for copy_locale operation'),
      entry_ids: z.array(z.string()).optional().describe('Entry IDs for update_status (collection models) or delete_entries'),
      locale: z.string().optional().describe('Scope update_status to a single locale (i18n models only; defaults to every supported locale)'),
      status: z.enum(['draft', 'in_review', 'published', 'rejected', 'archived']).optional().describe('New status for update_status'),
      confirm: z.boolean().optional().describe('Must be true for delete_entries'),
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
                const updates: Record<string, EntryMeta> = {}
                for (const entryId of Object.keys(entries)) {
                  updates[entryId] = {
                    status: 'draft',
                    source: 'agent',
                    updated_by: 'contentrain-mcp',
                  }
                }
                // One read-modify-write for the whole locale file — see writeMetaEntries.
                const written = await writeMetaEntries(wt, model, { locale: input.target_locale!, defaultLocale: config.locales.default }, updates)
                copiedCount = written.length
              } else {
                await writeMeta(wt, model, { locale: input.target_locale!, defaultLocale: config.locales.default }, {
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
                ...normalizeOperationError(error, 'bulk_copy_locale'),
              }) }],
              isError: true,
            }
          } finally {
            await tx.cleanup()
          }
        }

        case 'update_status': {
          if (!input.status) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: 'update_status requires status' }) }],
              isError: true,
            }
          }

          // Documents keep meta per slug (meta/{model}/{slug}/{locale}.json), so
          // they need a slug list rather than entry_ids. Rejected until that lands.
          if (model.kind === 'document') {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Model "${input.model}" is a document model. update_status does not support documents yet — their meta is keyed by slug, not entry ID.`,
              }) }],
              isError: true,
            }
          }

          // Only collections key meta by entry ID; singletons and dictionaries
          // have exactly one meta record per locale. Checked before entry_ids so
          // a singleton gets a usable error instead of a dead end.
          const keyedByEntry = model.kind === 'collection'
          if (keyedByEntry && (!input.entry_ids || input.entry_ids.length === 0)) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ error: `update_status requires entry_ids for collection model "${input.model}".` }) }],
              isError: true,
            }
          }
          if (!keyedByEntry && input.entry_ids && input.entry_ids.length > 0) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Model "${input.model}" is a ${model.kind} model — it has one meta record per locale, so entry_ids do not apply. Omit entry_ids.`,
              }) }],
              isError: true,
            }
          }

          if (input.locale && !config.locales.supported.includes(input.locale)) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Locale "${input.locale}" is not supported. Supported: [${config.locales.supported.join(', ')}]`,
              }) }],
              isError: true,
            }
          }

          // A non-i18n model stores one meta record at the default locale, so
          // fanning out over supported locales would rewrite the same file.
          const targetLocales = model.i18n
            ? (input.locale ? [input.locale] : config.locales.supported)
            : [config.locales.default]

          const branch = buildBranchName('bulk', input.model)
          const tx = await createTransaction(projectRoot, branch)

          try {
            // Counted from what is actually persisted, never from the input.
            const updatedPerLocale: Record<string, string[]> = {}
            const foundIds = new Set<string>()

            await tx.write(async (wt) => {
              for (const locale of targetLocales) {
                if (keyedByEntry) {
                  const metaData = await readMeta(wt, model, { locale, defaultLocale: config.locales.default }) as Record<string, EntryMeta> | null

                  const updates: Record<string, EntryMeta> = {}
                  for (const entryId of input.entry_ids!) {
                    const existing = metaData?.[entryId]
                    if (!existing) continue
                    updates[entryId] = { ...existing, status: input.status!, updated_by: 'contentrain-mcp' }
                    foundIds.add(entryId)
                  }

                  // One read-modify-write for the whole locale file — see writeMetaEntries.
                  const written = await writeMetaEntries(wt, model, { locale, defaultLocale: config.locales.default }, updates)
                  if (written.length > 0) updatedPerLocale[locale] = written
                } else {
                  const existing = await readMeta(wt, model, { locale, defaultLocale: config.locales.default }) as EntryMeta | null
                  if (!existing) continue
                  await writeMeta(wt, model, { locale, defaultLocale: config.locales.default }, {
                    ...existing,
                    status: input.status!,
                    updated_by: 'contentrain-mcp',
                  })
                  updatedPerLocale[locale] = [model.id]
                }
              }
            })

            const updatedCount = Object.values(updatedPerLocale).reduce((n, ids) => n + ids.length, 0)
            const notFound = keyedByEntry
              ? input.entry_ids!.filter(id => !foundIds.has(id))
              : []

            if (updatedCount === 0) {
              await tx.cleanup()
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  error: keyedByEntry
                    ? `No meta records found for the given entry_ids in model "${input.model}" across locales [${targetLocales.join(', ')}]. Nothing was changed.`
                    : `No meta record found for model "${input.model}" across locales [${targetLocales.join(', ')}]. Nothing was changed.`,
                  not_found: notFound.length > 0 ? notFound : undefined,
                }, null, 2) }],
                isError: true,
              }
            }

            await tx.commit(`[contentrain] bulk: update status → ${input.status} for ${input.model}`, {
              tool: 'contentrain_bulk',
              model: input.model,
              ...(keyedByEntry ? { entries: input.entry_ids! } : {}),
            })
            const gitResult = await tx.complete()

            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                status: 'committed',
                operation: 'update_status',
                message: `Updated ${updatedCount} meta record(s) to status "${input.status}" across locales [${Object.keys(updatedPerLocale).join(', ')}].`,
                updated: updatedCount,
                updated_by_locale: updatedPerLocale,
                not_found: notFound.length > 0 ? notFound : undefined,
                git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
                context_updated: true,
              }, null, 2) }],
            }
          } catch (error) {
            await tx.cleanup()
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                ...normalizeOperationError(error, 'bulk_update_status'),
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
                const removed = await deleteContent(wt, model, { id: entryId, defaultLocale: config.locales.default })
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
