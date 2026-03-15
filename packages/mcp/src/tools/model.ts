import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ModelDefinition } from '@contentrain/types'
import { z } from 'zod'
import { readConfig } from '../core/config.js'

import { resolveContentDir, resolveJsonFilePath, resolveMdFilePath } from '../core/content-manager.js'
import { checkReferences, deleteModel, readModel, writeModel, validateModelDefinition } from '../core/model-manager.js'
import { createTransaction, buildBranchName } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'

const fieldDefSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.object({
  type: z.string(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  default: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  options: z.array(z.string()).optional(),
  model: z.union([z.string(), z.array(z.string())]).optional(),
  items: z.union([z.string(), z.lazy(() => z.record(z.string(), z.unknown()))]).optional(),
  fields: z.lazy(() => z.record(z.string(), z.unknown())).optional(),
  accept: z.string().optional(),
  maxSize: z.number().optional(),
  description: z.string().optional(),
}))

export function registerModelTools(server: McpServer, projectRoot: string): void {
  // ─── contentrain_model_save ───
  server.tool(
    'contentrain_model_save',
    'Create or update a model definition. Changes are auto-committed to git — do NOT manually edit .contentrain/ files after calling this tool.',
    {
      id: z.string().describe('Model ID (kebab-case, e.g. "blog-post")'),
      name: z.string().describe('Human-readable name'),
      kind: z.enum(['singleton', 'collection', 'document', 'dictionary']).describe('Model kind'),
      domain: z.string().describe('Content domain (e.g. "blog", "marketing", "system")'),
      i18n: z.boolean().describe('Whether this model supports localization'),
      description: z.string().optional().describe('Model description'),
      fields: fieldDefSchema.optional().describe('Field definitions (not needed for dictionary)'),
      content_path: z.string().optional().describe('Framework-relative path for content files (e.g. "content/blog", "locales"). When set, content is written here instead of .contentrain/content/'),
      locale_strategy: z.enum(['file', 'suffix', 'directory', 'none']).optional().describe('How locale is encoded in file names. Default: "file"'),
    },
    async (input) => {
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      // Validate
      const errors = validateModel(input)
      if (errors.length > 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Validation failed', details: errors }) }],
          isError: true,
        }
      }

      // Reject invalid locale_strategy + i18n combinations
      if (input.locale_strategy === 'none' && input.i18n !== false) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'locale_strategy "none" requires i18n:false. The "none" strategy stores a single file without locale encoding, which is incompatible with multi-locale content. Use "file", "suffix", or "directory" for i18n models.',
          }) }],
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

      const existing = await readModel(projectRoot, input.id)
      const action = existing ? 'updated' : 'created'

      const model: ModelDefinition = {
        id: input.id,
        name: input.name,
        kind: input.kind,
        domain: input.domain,
        i18n: input.i18n,
        description: input.description,
        fields: input.fields as ModelDefinition['fields'],
        content_path: input.content_path,
        locale_strategy: input.locale_strategy,
      }

      const branch = buildBranchName('model', input.id)
      const tx = await createTransaction(projectRoot, branch)

      try {
        await tx.write(async (wt) => {
          await writeModel(wt, model)
        })

        await tx.commit(`[contentrain] ${action}: ${input.id}`)
        const gitResult = await tx.complete({ tool: 'contentrain_model_save', model: input.id })

        const defaultLocale = config.locales.default
        // Build accurate content path using path resolvers
        const contentDir = resolveContentDir(projectRoot, model)
        const contentPath = model.content_path ?? `.contentrain/content/${input.domain}/${input.id}`
        let exampleFilePath: string
        if (model.kind === 'document') {
          exampleFilePath = resolveMdFilePath(contentDir, model, defaultLocale, '{slug}')
        } else {
          exampleFilePath = resolveJsonFilePath(contentDir, model, defaultLocale)
        }
        // Make the path relative for display
        const displayPath = exampleFilePath.replace(projectRoot + '/', '').replace(projectRoot, '')
        const importSnippet: Record<string, string> = {
          generic: `import data from '${displayPath}'`,
        }
        if (config.stack === 'nuxt') {
          importSnippet['nuxt'] = model.kind === 'document'
            ? `const { data } = await useAsyncData(() => queryContent('${model.domain}/${model.id}').locale('${defaultLocale}').find())`
            : `const { data } = await useFetch('/api/content/${model.id}?locale=${defaultLocale}')`
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Model saved and committed to git. Do NOT manually edit .contentrain/ files.',
            action,
            model: input.id,
            validation: { valid: true, errors: [] },
            git: { branch, action: gitResult.action, commit: gitResult.commit },
            context_updated: true,
            content_path: contentPath + '/',
            example_file: displayPath,
            import_snippet: importSnippet,
            next_steps: ['Add content with contentrain_content_save'],
          }, null, 2) }],
        }
      } catch (error) {
        await tx.cleanup()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Model save failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      } finally {
        await tx.cleanup()
      }
    },
  )

  // ─── contentrain_model_delete ───
  server.tool(
    'contentrain_model_delete',
    'Delete a model and its content/meta. Changes are auto-committed to git — do NOT manually edit .contentrain/ files.',
    {
      model: z.string().describe('Model ID to delete'),
      confirm: z.literal(true).describe('Must be true to confirm deletion'),
    },
    async ({ model: modelId }) => {
      const config = await readConfig(projectRoot)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized.' }) }],
          isError: true,
        }
      }

      // Check model exists
      const existing = await readModel(projectRoot, modelId)
      if (!existing) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Model "${modelId}" not found` }) }],
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

      // Check references
      const refs = await checkReferences(projectRoot, modelId)
      if (refs.length > 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            deleted: false,
            error: 'REFERENCED_MODEL',
            referenced_by: refs,
            next_steps: ['Remove relation fields from referencing models first'],
          }, null, 2) }],
        }
      }

      const branch = buildBranchName('model', modelId)
      const tx = await createTransaction(projectRoot, branch)

      try {
        let filesRemoved: string[] = []

        await tx.write(async (wt) => {
          filesRemoved = await deleteModel(wt, modelId)
        })

        await tx.commit(`[contentrain] delete: ${modelId}`)
        const gitResult = await tx.complete({ tool: 'contentrain_model_delete', model: modelId })

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Model deleted and committed to git. Do NOT manually edit .contentrain/ files.',
            deleted: true,
            git: { branch, action: gitResult.action, commit: gitResult.commit },
            files_removed: filesRemoved,
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
}

// validateModel is now validateModelDefinition from model-manager.ts (shared)
const validateModel = validateModelDefinition
