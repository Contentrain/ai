import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readConfig, readVocabulary } from '../core/config.js'
import { readModel } from '../core/model-manager.js'
import { listContent } from '../core/content-manager.js'
import { applyChangesToWorktree, planContentDelete, planContentSave } from '../core/ops/index.js'
import { LocalReader } from '../providers/local/index.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'
import { validateProject } from '../core/validator.js'
import { TOOL_ANNOTATIONS } from './annotations.js'

export function registerContentTools(server: McpServer, projectRoot: string): void {
  // ─── contentrain_content_save ───
  server.tool(
    'contentrain_content_save',
    'Save content entries. Entry format varies by model kind: DICTIONARY — provide "locale" and "data" (flat key-value, all string values); "id" and "slug" are ignored; data keys are the identities. COLLECTION — provide "locale" and "data"; "id" is optional (auto-generated if omitted); "slug" is ignored. DOCUMENT — provide "slug" (required), "locale", and "data"; use the "body" key inside data for markdown content. SINGLETON — provide only "locale" and "data". Changes are auto-committed to git — do NOT manually edit .contentrain/ files after calling this tool.',
    {
      model: z.string().describe('Model ID'),
      entries: z.array(z.object({
        id: z.string().optional().describe('Entry ID (collection only, auto-generated if omitted)'),
        slug: z.string().optional().describe('Slug (document only)'),
        locale: z.string().optional().describe('Locale code (defaults to config default)'),
        data: z.record(z.string(), z.unknown()).describe('Content data. For documents, include "body" key for markdown content.'),
        publish_at: z.string().optional().describe('ISO 8601 date for scheduled publishing (stored in meta)'),
        expire_at: z.string().optional().describe('ISO 8601 date for scheduled expiry (stored in meta, must be after publish_at)'),
      })).describe('Content entries to save'),
    },
    TOOL_ANNOTATIONS['contentrain_content_save']!,
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

      // Validate locales and scheduling fields before starting transaction
      for (const entry of input.entries) {
        if (entry.locale && !config.locales.supported.includes(entry.locale)) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              error: `Locale "${entry.locale}" is not supported. Supported: [${config.locales.supported.join(', ')}]`,
            }) }],
            isError: true,
          }
        }

        // Validate publish_at / expire_at
        if (entry.publish_at !== undefined) {
          const d = new Date(entry.publish_at)
          if (Number.isNaN(d.getTime())) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Invalid publish_at date: "${entry.publish_at}". Must be a valid ISO 8601 date string.`,
              }) }],
              isError: true,
            }
          }
        }
        if (entry.expire_at !== undefined) {
          const d = new Date(entry.expire_at)
          if (Number.isNaN(d.getTime())) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `Invalid expire_at date: "${entry.expire_at}". Must be a valid ISO 8601 date string.`,
              }) }],
              isError: true,
            }
          }
        }
        if (entry.publish_at !== undefined && entry.expire_at !== undefined) {
          if (new Date(entry.expire_at) <= new Date(entry.publish_at)) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({
                error: `expire_at ("${entry.expire_at}") must be after publish_at ("${entry.publish_at}").`,
              }) }],
              isError: true,
            }
          }
        }

        // Merge scheduling fields into data so meta-manager picks them up
        if (entry.publish_at !== undefined) entry.data['publish_at'] = entry.publish_at
        if (entry.expire_at !== undefined) entry.data['expire_at'] = entry.expire_at
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

      const vocabulary = await readVocabulary(projectRoot)
      const reader = new LocalReader(projectRoot)

      let plan: Awaited<ReturnType<typeof planContentSave>>
      try {
        plan = await planContentSave(reader, {
          model,
          entries: input.entries,
          config,
          vocabulary,
        })
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Content save failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }

      const entryIds = plan.result
        .map(r => r.id ?? r.slug ?? r.locale)
        .filter((v): v is string => Boolean(v))

      const branch = buildBranchName('content', input.model)
      const tx = await createTransaction(projectRoot, branch)

      try {
        await tx.write(async (wt) => {
          await applyChangesToWorktree(wt, plan.changes)
        })

        await tx.commit(`[contentrain] content: ${input.model}`, {
          tool: 'contentrain_content_save',
          model: input.model,
          locale: input.entries[0]?.locale,
          entries: entryIds,
        })
        const gitResult = await tx.complete()

        // Run real validation after save — don't fake it
        const validationResult = await validateProject(projectRoot, { model: input.model })

        // Collect advisories from write results (e.g., duplicate value warnings)
        const allAdvisories = plan.result.flatMap(r => r.advisories ?? [])

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Content saved and committed to git. Do NOT manually edit .contentrain/ files.',
            results: plan.result,
            git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
            ...(allAdvisories.length > 0 ? {
              advisories: allAdvisories,
              advisory_note: 'Save succeeded. Review these warnings and consider consolidating duplicate values.',
            } : {}),
            validation: {
              valid: validationResult.valid,
              errors: validationResult.issues.filter(i => i.severity === 'error').map(i => i.message),
            },
            context_updated: true,
            next_steps: [
              ...(allAdvisories.length > 0 ? ['ADVISORY: Duplicate values detected — review advisories above'] : []),
              ...(!validationResult.valid ? ['WARNING: Content has validation errors — run contentrain_validate for details'] : []),
              ...(model.kind === 'collection'
                ? ['Use contentrain_content_list to verify', 'Add more entries or publish']
                : ['Use contentrain_content_list to verify']),
            ],
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
    'Delete content entries. For dictionaries, use "keys" to remove specific keys (omit to delete entire locale file). Changes are auto-committed to git — do NOT manually edit .contentrain/ files after calling this tool.',
    {
      model: z.string().describe('Model ID'),
      id: z.string().optional().describe('Entry ID (collection)'),
      slug: z.string().optional().describe('Slug (document)'),
      locale: z.string().optional().describe('Locale code'),
      keys: z.array(z.string()).optional().describe('Dictionary only: specific keys to remove. Omit to delete entire locale file.'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    TOOL_ANNOTATIONS['contentrain_content_delete']!,
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

      // Branch health gate
      const deleteHealth = await checkBranchHealth(projectRoot)
      if (deleteHealth.blocked) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: deleteHealth.message,
            action: 'blocked',
            hint: 'Merge or delete old contentrain/* branches before creating new ones.',
          }, null, 2) }],
          isError: true,
        }
      }

      const deleteReader = new LocalReader(projectRoot)

      let deletePlan: Awaited<ReturnType<typeof planContentDelete>>
      try {
        deletePlan = await planContentDelete(deleteReader, {
          model,
          id: input.id,
          slug: input.slug,
          locale: input.locale,
          keys: input.keys,
        })
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }

      const branch = buildBranchName('content', input.model)
      const tx = await createTransaction(projectRoot, branch)

      try {
        await tx.write(async (wt) => {
          await applyChangesToWorktree(wt, deletePlan.changes)
        })

        await tx.commit(`[contentrain] delete content: ${input.model}`, {
          tool: 'contentrain_content_delete',
          model: input.model,
          locale: input.locale,
        })
        const gitResult = await tx.complete()

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Content deleted and committed to git. Do NOT manually edit .contentrain/ files.',
            deleted: true,
            files_removed: deletePlan.result,
            git: { branch, action: gitResult.action, commit: gitResult.commit, ...(gitResult.sync ? { sync: gitResult.sync } : {}) },
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
    TOOL_ANNOTATIONS['contentrain_content_list']!,
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
