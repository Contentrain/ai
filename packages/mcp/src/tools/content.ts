import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readConfig } from '../core/config.js'
import { writeContext } from '../core/context.js'
import { readModel } from '../core/model-manager.js'
import { writeContent, deleteContent, listContent } from '../core/content-manager.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'

export function registerContentTools(server: McpServer, projectRoot: string): void {
  // ─── contentrain_content_save ───
  server.tool(
    'contentrain_content_save',
    'Save content entries (singleton/collection/document/dictionary). Changes are auto-committed to git — do NOT manually edit .contentrain/ files after calling this tool.',
    {
      model: z.string().describe('Model ID'),
      entries: z.array(z.object({
        id: z.string().optional().describe('Entry ID (collection only, auto-generated if omitted)'),
        slug: z.string().optional().describe('Slug (document only)'),
        locale: z.string().optional().describe('Locale code (defaults to config default)'),
        data: z.record(z.string(), z.unknown()).describe('Content data. For documents, include "body" key for markdown content.'),
      })).describe('Content entries to save'),
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

      // Validate locales before starting transaction
      for (const entry of input.entries) {
        if (entry.locale && !config.locales.supported.includes(entry.locale)) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: `Locale "${entry.locale}" is not supported. Supported: [${config.locales.supported.join(', ')}]`,
            }) }],
            isError: true,
          }
        }
      }

      const branch = buildBranchName('content', input.model)
      const tx = await createTransaction(projectRoot, branch)

      try {
        let results: Awaited<ReturnType<typeof writeContent>>

        await tx.write(async (wt) => {
          results = await writeContent(wt, model, input.entries, config)
        })

        await tx.commit(`[contentrain] content: ${input.model}`)
        const gitResult = await tx.complete()

        const entryIds = results!.map(r => r.id ?? r.slug ?? r.locale).filter(Boolean) as string[]
        await writeContext(projectRoot, {
          tool: 'contentrain_content_save',
          model: input.model,
          locale: input.entries[0]?.locale,
          entries: entryIds,
        })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Content saved and committed to git. Do NOT manually edit .contentrain/ files.',
            results: results!,
            git: { branch, action: gitResult.action, commit: gitResult.commit },
            validation: { valid: true, errors: [] },
            context_updated: true,
            next_steps: model.kind === 'collection'
              ? ['Use contentrain_content_list to verify', 'Add more entries or publish']
              : ['Use contentrain_content_list to verify'],
          }, null, 2) }],
        }
      } catch (error) {
        await tx.cleanup()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Content save failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      } finally {
        await tx.cleanup()
      }
    },
  )

  // ─── contentrain_content_delete ───
  server.tool(
    'contentrain_content_delete',
    'Delete content entries. Changes are auto-committed to git — do NOT manually edit .contentrain/ files after calling this tool.',
    {
      model: z.string().describe('Model ID'),
      id: z.string().optional().describe('Entry ID (collection)'),
      slug: z.string().optional().describe('Slug (document)'),
      locale: z.string().optional().describe('Locale code'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    async (input) => {
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized.' }) }],
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

      const branch = buildBranchName('content', input.model)
      const tx = await createTransaction(projectRoot, branch)

      try {
        let removed: string[] = []

        await tx.write(async (wt) => {
          removed = await deleteContent(wt, model, {
            id: input.id,
            slug: input.slug,
            locale: input.locale,
          })
        })

        await tx.commit(`[contentrain] delete content: ${input.model}`)
        const gitResult = await tx.complete()

        await writeContext(projectRoot, {
          tool: 'contentrain_content_delete',
          model: input.model,
          locale: input.locale,
        })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Content deleted and committed to git. Do NOT manually edit .contentrain/ files.',
            deleted: true,
            files_removed: removed,
            git: { branch, action: gitResult.action, commit: gitResult.commit },
            context_updated: true,
          }, null, 2) }],
        }
      } catch (error) {
        await tx.cleanup()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      } finally {
        await tx.cleanup()
      }
    },
  )

  // ─── contentrain_content_list ───
  server.tool(
    'contentrain_content_list',
    'List content entries (read-only). Returns data from .contentrain/ — do NOT manually create or modify content files.',
    {
      model: z.string().describe('Model ID'),
      locale: z.string().optional().describe('Locale code (defaults to config default)'),
      filter: z.record(z.string(), z.unknown()).optional().describe('Filter criteria (collection only)'),
      resolve: z.boolean().optional().describe('Resolve relation fields to actual data'),
      limit: z.number().optional().describe('Max entries to return'),
      offset: z.number().optional().describe('Skip N entries'),
    },
    async (input) => {
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized.' }) }],
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

      try {
        const result = await listContent(projectRoot, model, {
          locale: input.locale,
          filter: input.filter as Record<string, unknown>,
          resolve: input.resolve,
          limit: input.limit,
          offset: input.offset,
        }, config)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `List failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }
    },
  )
}
