import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ModelDefinition } from '@contentrain/types'
import { z } from 'zod'
import type { ToolProvider } from '../server.js'
import { readConfig } from '../core/config.js'
import { buildContextChange } from '../core/context.js'

import { resolveContentDir, resolveJsonFilePath, resolveMdFilePath } from '../core/content-manager.js'
import { checkReferences, readModel, validateModelDefinition, fieldDefZodSchema } from '../core/model-manager.js'
import { planModelDelete, planModelSave } from '../core/ops/index.js'
import { LocalProvider } from '../providers/local/index.js'
import { buildBranchName } from '../git/transaction.js'
import { checkBranchHealth } from '../git/branch-lifecycle.js'
import { TOOL_ANNOTATIONS } from './annotations.js'

// Shared field definition schema — single source of truth with normalize extract
const fieldDefSchema = fieldDefZodSchema

export function registerModelTools(
  server: McpServer,
  provider: ToolProvider,
  projectRoot: string | undefined,
): void {
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
    TOOL_ANNOTATIONS['contentrain_model_save']!,
    async (input) => {
      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized. Run contentrain_init first.' }) }],
          isError: true,
        }
      }

      const errors = validateModel(input)
      if (errors.length > 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Validation failed', details: errors }) }],
          isError: true,
        }
      }

      if (input.locale_strategy === 'none' && input.i18n !== false) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: 'locale_strategy "none" requires i18n:false. The "none" strategy stores a single file without locale encoding, which is incompatible with multi-locale content. Use "file", "suffix", or "directory" for i18n models.',
          }) }],
          isError: true,
        }
      }

      if (provider instanceof LocalProvider) {
        const health = await checkBranchHealth(provider.projectRoot)
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
      }

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

      const savePlan = await planModelSave(provider, { model })
      const action = savePlan.result.action
      const branch = buildBranchName('model', input.id)
      const message = `[contentrain] ${action}: ${input.id}`
      const contextPayload = { tool: 'contentrain_model_save', model: input.id }

      let commitSha: string
      let workflowAction: 'auto-merged' | 'pending-review'
      let sync: unknown

      try {
        if (provider instanceof LocalProvider) {
          const result = await provider.applyPlan({
            branch,
            changes: savePlan.changes,
            message,
            context: contextPayload,
          })
          commitSha = result.sha
          workflowAction = result.workflowAction
          sync = result.sync
        } else {
          const contextChange = await buildContextChange(provider, contextPayload)
          const allChanges = [...savePlan.changes, contextChange]
            .toSorted((a, b) => a.path.localeCompare(b.path))
          const commit = await provider.applyPlan({
            branch,
            changes: allChanges,
            message,
            author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
            base: config.repository?.default_branch ?? 'contentrain',
          })
          commitSha = commit.sha
          workflowAction = 'pending-review'
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Model save failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }

      // DX helpers (import snippet, example path) are only computed when we
      // can resolve local paths — they do not apply to remote-only flows.
      const defaultLocale = config.locales.default
      const contentPath = model.content_path ?? `.contentrain/content/${input.domain}/${input.id}`
      let displayPath: string | undefined
      let importSnippet: Record<string, string> | undefined
      if (projectRoot) {
        const contentDir = resolveContentDir(projectRoot, model)
        const exampleFilePath = model.kind === 'document'
          ? resolveMdFilePath(contentDir, model, defaultLocale, '{slug}')
          : resolveJsonFilePath(contentDir, model, defaultLocale)
        displayPath = exampleFilePath.replace(projectRoot + '/', '').replace(projectRoot, '')
        importSnippet = {
          generic: `import data from '${displayPath}'`,
        }
        if (config.stack === 'nuxt') {
          importSnippet['nuxt'] = model.kind === 'document'
            ? `const { data } = await useAsyncData(() => queryContent('${model.domain}/${model.id}').locale('${defaultLocale}').find())`
            : `const { data } = await useFetch('/api/content/${model.id}?locale=${defaultLocale}')`
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({
          status: 'committed',
          message: 'Model saved and committed to git. Do NOT manually edit .contentrain/ files.',
          action,
          model: input.id,
          validation: { valid: true, errors: [] },
          git: { branch, action: workflowAction, commit: commitSha, ...(sync ? { sync } : {}) },
          context_updated: true,
          content_path: contentPath + '/',
          ...(displayPath ? { example_file: displayPath } : {}),
          ...(importSnippet ? { import_snippet: importSnippet } : {}),
          next_steps: ['Add content with contentrain_content_save'],
        }, null, 2) }],
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
    TOOL_ANNOTATIONS['contentrain_model_delete']!,
    async ({ model: modelId }) => {
      const config = await readConfig(provider)
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Project not initialized.' }) }],
          isError: true,
        }
      }

      const existing = await readModel(provider, modelId)
      if (!existing) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Model "${modelId}" not found` }) }],
          isError: true,
        }
      }

      if (provider instanceof LocalProvider) {
        const deleteHealth = await checkBranchHealth(provider.projectRoot)
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

        // Reference integrity check walks every model on disk — reader
        // fallback is planned with Phase 5.5 when checkReferences gets a
        // RepoReader overload. Remote writes skip the pre-check and rely
        // on the caller (Studio) to enforce referential integrity.
        const refs = await checkReferences(provider.projectRoot, modelId)
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
      }

      const deletePlan = await planModelDelete(provider, { model: existing })
      const branch = buildBranchName('model', modelId)
      const message = `[contentrain] delete: ${modelId}`
      const contextPayload = { tool: 'contentrain_model_delete', model: modelId }

      let commitSha: string
      let workflowAction: 'auto-merged' | 'pending-review'
      let sync: unknown

      try {
        if (provider instanceof LocalProvider) {
          const result = await provider.applyPlan({
            branch,
            changes: deletePlan.changes,
            message,
            context: contextPayload,
          })
          commitSha = result.sha
          workflowAction = result.workflowAction
          sync = result.sync
        } else {
          const contextChange = await buildContextChange(provider, contextPayload)
          const allChanges = [...deletePlan.changes, contextChange]
            .toSorted((a, b) => a.path.localeCompare(b.path))
          const commit = await provider.applyPlan({
            branch,
            changes: allChanges,
            message,
            author: { name: 'Contentrain', email: 'mcp@contentrain.io' },
            base: config.repository?.default_branch ?? 'contentrain',
          })
          commitSha = commit.sha
          workflowAction = 'pending-review'
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            status: 'committed',
            message: 'Model deleted and committed to git. Do NOT manually edit .contentrain/ files.',
            deleted: true,
            git: { branch, action: workflowAction, commit: commitSha, ...(sync ? { sync } : {}) },
            files_removed: deletePlan.result,
            context_updated: true,
          }, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            error: `Delete failed: ${error instanceof Error ? error.message : String(error)}`,
          }) }],
          isError: true,
        }
      }
    },
  )
}

// validateModel is now validateModelDefinition from model-manager.ts (shared)
const validateModel = validateModelDefinition
