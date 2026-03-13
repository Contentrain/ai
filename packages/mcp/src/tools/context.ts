import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readConfig, readVocabulary } from '../core/config.js'
import { readContext } from '../core/context.js'
import { countEntries, listModels, readModel } from '../core/model-manager.js'
import { detectStack } from '../util/detect.js'
import { join } from 'node:path'
import { contentrainDir, pathExists } from '../util/fs.js'

export function registerContextTools(server: McpServer, projectRoot: string): void {
  // ─── contentrain_status ───
  server.tool(
    'contentrain_status',
    'Get full project status (read-only). Returns config, models, context. Do NOT manually edit .contentrain/ based on this output.',
    {},
    async () => {
      const crDir = contentrainDir(projectRoot)
      const initialized = await pathExists(join(crDir, 'config.json'))

      if (!initialized) {
        const detectedStack = await detectStack(projectRoot)
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              initialized: false,
              detected_stack: detectedStack,
              suggestion: 'Run contentrain_init to set up .contentrain/ structure',
              next_steps: ['Run contentrain_init'],
            }, null, 2),
          }],
        }
      }

      const config = await readConfig(projectRoot)
      const models = await listModels(projectRoot)
      const context = await readContext(projectRoot)
      const vocabulary = await readVocabulary(projectRoot)

      const errors: string[] = []
      if (!config) errors.push('.contentrain/config.json missing')

      const result: Record<string, unknown> = {
        initialized: true,
        config: config ? {
          stack: config.stack,
          workflow: config.workflow,
          locales: config.locales,
          domains: config.domains,
          repository: config.repository,
        } : null,
        models,
        context: context ? {
          lastOperation: context.lastOperation,
          stats: context.stats,
        } : null,
        vocabulary_size: vocabulary ? Object.keys(vocabulary.terms).length : 0,
      }

      if (errors.length > 0) {
        result['validation'] = { errors: errors.length, warnings: 0, summary: errors }
      }

      const nextSteps: string[] = []
      if (models.length === 0) nextSteps.push('Create models with contentrain_model_save')
      if (errors.length > 0) nextSteps.push(`Fix ${errors.length} validation error(s)`)
      if (nextSteps.length === 0) nextSteps.push('Use contentrain_describe to inspect a model')
      result['next_steps'] = nextSteps

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )

  // ─── contentrain_describe ───
  server.tool(
    'contentrain_describe',
    'Get full schema of a single model (read-only). Do NOT manually create content files — use contentrain_content_save instead.',
    {
      model: z.string().describe('Model ID (e.g. "blog-post", "hero")'),
      include_sample: z.boolean().optional().default(false).describe('Include one sample entry'),
      locale: z.string().optional().describe('Locale for sample content (default: config default locale)'),
    },
    async ({ model: modelId, include_sample, locale }) => {
      const modelDef = await readModel(projectRoot, modelId)
      if (!modelDef) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Model "${modelId}" not found` }) }],
          isError: true,
        }
      }

      const config = await readConfig(projectRoot)
      const effectiveLocale = locale ?? config?.locales.default ?? 'en'
      const stats = await countEntries(projectRoot, modelDef)

      const result: Record<string, unknown> = {
        id: modelDef.id,
        name: modelDef.name,
        kind: modelDef.kind,
        domain: modelDef.domain,
        i18n: modelDef.i18n,
        description: modelDef.description,
        fields: modelDef.fields,
        stats: { total_entries: stats.total, locales: stats.locales },
      }

      if (include_sample) {
        const sample = await getSample(projectRoot, modelDef, effectiveLocale)
        if (sample) result['sample'] = sample
      }

      // Stack-aware import snippet
      const stack = config?.stack ?? 'other'
      result['import_snippet'] = generateImportSnippet(modelDef, stack, effectiveLocale)

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )
}

async function getSample(
  projectRoot: string,
  model: import('@contentrain/types').ModelDefinition,
  locale: string,
): Promise<unknown> {
  const { readJson } = await import('../util/fs.js')
  const contentDir = model.content_path
    ? join(projectRoot, model.content_path)
    : join(contentrainDir(projectRoot), 'content', model.domain, model.id)

  if (model.kind === 'collection') {
    const data = await readJson<Record<string, Record<string, unknown>>>(join(contentDir, `${locale}.json`))
    if (!data) return null
    const firstKey = Object.keys(data)[0]
    return firstKey ? { id: firstKey, ...data[firstKey] } : null
  }

  if (model.kind === 'singleton' || model.kind === 'dictionary') {
    return readJson(join(contentDir, `${locale}.json`))
  }

  if (model.kind === 'document') {
    // Return first entry slug
    const { readDir } = await import('../util/fs.js')
    const entries = await readDir(contentDir)
    return entries[0] ? { slug: entries[0], locale } : null
  }

  return null
}

function buildContentPath(
  model: import('@contentrain/types').ModelDefinition,
  locale: string,
): string {
  const strategy = model.locale_strategy ?? 'file'
  const baseDir = model.content_path ?? `.contentrain/content/${model.domain}/${model.id}`

  if (model.kind === 'document') {
    // Documents use directories — show the base path pattern
    switch (strategy) {
      case 'suffix': return `${baseDir}/{slug}.${locale}.md`
      case 'directory': return `${baseDir}/${locale}/{slug}.md`
      case 'none': return `${baseDir}/{slug}.md`
      case 'file':
      default: return `${baseDir}/{slug}/${locale}.md`
    }
  }

  // JSON-based models (collection, singleton, dictionary)
  switch (strategy) {
    case 'suffix': return `${baseDir}/${model.id}.${locale}.json`
    case 'directory': return `${baseDir}/${locale}/${model.id}.json`
    case 'none': return `${baseDir}/${model.id}.json`
    case 'file':
    default: return `${baseDir}/${locale}.json`
  }
}

function generateImportSnippet(
  model: import('@contentrain/types').ModelDefinition,
  stack: string,
  locale: string,
): Record<string, string> {
  const path = buildContentPath(model, locale)

  const snippets: Record<string, string> = {
    generic: `import data from '${path}'`,
  }

  switch (stack) {
    case 'nuxt':
      snippets['nuxt'] = model.kind === 'document'
        ? `const { data } = await useAsyncData(() => queryContent('${model.domain}/${model.id}').locale('${locale}').find())`
        : `const { data } = await useFetch('/api/content/${model.id}?locale=${locale}')`
      break
    case 'next':
      snippets['next'] = `import data from '@/${path}'`
      break
    case 'astro':
      snippets['astro'] = `import data from '~/${path}'`
      break
  }

  return snippets
}
