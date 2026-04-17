import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ToolProvider } from '../server.js'
import { readConfig, readVocabulary } from '../core/config.js'
import { readContext } from '../core/context.js'
import { countEntries, listModels, readModel } from '../core/model-manager.js'
import { resolveLocaleStrategy } from '../core/content-manager.js'
import { contentDirPath, contentFilePath } from '../core/ops/paths.js'
import { detectStack } from '../util/detect.js'
import { join } from 'node:path'
import { pathExists } from '../util/fs.js'
import { checkBranchHealth, cleanupMergedBranches } from '../git/branch-lifecycle.js'
import { TOOL_ANNOTATIONS } from './annotations.js'

export function registerContextTools(
  server: McpServer,
  provider: ToolProvider,
  projectRoot: string | undefined,
): void {
  // ─── contentrain_status ───
  server.tool(
    'contentrain_status',
    'Get full project status (read-only). Returns config, models, context. Do NOT manually edit .contentrain/ based on this output.',
    {},
    TOOL_ANNOTATIONS['contentrain_status']!,
    async () => {
      // Read-only status works over any provider. Stack detection and
      // branch health are projectRoot-only — they degrade gracefully
      // when the session is driven by a remote provider.
      const initialized = await provider.fileExists('.contentrain/config.json')

      if (!initialized) {
        const detectedStack = projectRoot ? await detectStack(projectRoot) : null
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              initialized: false,
              ...(detectedStack ? { detected_stack: detectedStack } : {}),
              suggestion: 'Run contentrain_init to set up .contentrain/ structure',
              next_steps: ['Run contentrain_init'],
            }, null, 2),
          }],
        }
      }

      const config = await readConfig(provider)
      const models = await listModels(provider)
      const context = projectRoot ? await readContext(projectRoot) : null
      const vocabulary = await readVocabulary(provider)

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
        vocabulary: vocabulary && Object.keys(vocabulary.terms).length > 0
          ? { size: Object.keys(vocabulary.terms).length, terms: vocabulary.terms }
          : { size: 0 },
      }

      // Branch lifecycle: lazy cleanup + health check. Local-only, uses
      // simple-git against the working tree. Skipped on remote providers
      // where branch state is managed by Studio / the platform.
      if (projectRoot) {
        const hasGitRepo = await pathExists(join(projectRoot, '.git'))
        if (hasGitRepo) {
          try {
            const cleanup = await cleanupMergedBranches(projectRoot)
            const health = await checkBranchHealth(projectRoot)
            result['branches'] = {
              total: health.total,
              merged: health.merged,
              unmerged: health.unmerged,
              cleaned_up: cleanup.deleted,
            }
            if (health.message) {
              result['branch_warning'] = health.message
            }
            if (health.blocked) {
              errors.push(health.message!)
            }
          } catch {
            // Branch health check is best-effort — don't fail status
          }
        }
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
    TOOL_ANNOTATIONS['contentrain_describe']!,
    async ({ model: modelId, include_sample, locale }) => {
      const modelDef = await readModel(provider, modelId)
      if (!modelDef) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `Model "${modelId}" not found` }) }],
          isError: true,
        }
      }

      const config = await readConfig(provider)
      const effectiveLocale = locale ?? config?.locales.default ?? 'en'
      const stats = await countEntries(provider, modelDef)

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
        const sample = await getSample(provider, modelDef, effectiveLocale)
        if (sample) result['sample'] = sample
      }

      // Stack-aware import snippet
      const stack = config?.stack ?? 'other'
      result['import_snippet'] = generateImportSnippet(modelDef, stack, effectiveLocale)

      // Vocabulary hint for dictionary models
      if (modelDef.kind === 'dictionary') {
        const vocabulary = await readVocabulary(provider)
        if (vocabulary && Object.keys(vocabulary.terms).length > 0) {
          result['vocabulary_hint'] = {
            note: 'Check these approved terms before creating new dictionary keys',
            terms: vocabulary.terms,
          }
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    },
  )

  // ─── contentrain_describe_format ───
  server.tool(
    'contentrain_describe_format',
    'Describes the Contentrain content file format for any language/platform. Returns a comprehensive specification of the file structure, JSON formats, markdown conventions, meta files, and locale strategies.',
    {},
    TOOL_ANNOTATIONS['contentrain_describe_format']!,
    async () => {
      const formatSpec = {
        overview: 'Contentrain stores content as plain JSON and Markdown files in a .contentrain/ directory at the project root. All files are committed to git.',
        directory_structure: {
          description: 'Standard layout of .contentrain/ directory',
          layout: {
            '.contentrain/config.json': 'Project configuration (stack, workflow, locales, domains)',
            '.contentrain/context.json': 'Last operation metadata (written by MCP after every write)',
            '.contentrain/vocabulary.json': 'Shared vocabulary/terms (optional)',
            '.contentrain/models/{model-id}.json': 'Model schema definitions',
            '.contentrain/content/{domain}/{model-id}/': 'Content files per model',
            '.contentrain/meta/{model-id}/': 'Metadata files per model (status, source, timestamps)',
          },
        },
        model_kinds: {
          collection: {
            description: 'Multiple entries stored as an object-map keyed by entry ID',
            storage_format: 'JSON object-map: { "entry-id-1": { ...fields }, "entry-id-2": { ...fields } }',
            note: 'Keys are sorted alphabetically for canonical output. Entry IDs are alphanumeric (1-40 chars, hyphens/underscores allowed).',
            example: '{ "abc123": { "title": "Hello", "slug": "hello" }, "def456": { "title": "World", "slug": "world" } }',
          },
          singleton: {
            description: 'Single entry (e.g. site settings, hero section)',
            storage_format: 'JSON object with field key-value pairs: { "title": "My Site", "description": "..." }',
          },
          document: {
            description: 'Markdown files with YAML-like frontmatter',
            storage_format: 'Markdown file: ---\\nslug: my-post\\ntitle: My Post\\n---\\n\\nMarkdown body content here.',
            frontmatter_rules: [
              'Delimited by --- on its own line',
              'Key-value pairs: key: value',
              'Arrays: key:\\n  - item1\\n  - item2',
              'Inline arrays: key: [item1, item2]',
              'Values auto-parsed: true/false -> boolean, integers -> number, quoted -> string',
              '"body" key is reserved for the markdown content below the frontmatter',
            ],
          },
          dictionary: {
            description: 'Flat key-value string map (e.g. i18n translation files)',
            storage_format: 'JSON object: { "greeting": "Hello", "farewell": "Goodbye" }',
            note: 'All values must be strings.',
          },
        },
        meta_files: {
          description: 'Metadata is stored separately from content in .contentrain/meta/{model-id}/',
          collection_meta: 'Object-map: { "entry-id": { "status": "draft", "source": "agent", "updated_by": "contentrain-mcp" } }',
          singleton_meta: 'Single object: { "status": "published", "source": "human", "updated_by": "user@example.com" }',
          fields: {
            status: 'Content lifecycle status: "draft" | "in_review" | "published" | "rejected" | "archived"',
            source: 'Who created the entry: "agent" | "human" | "import"',
            updated_by: 'Author identifier string',
            approved_by: 'Optional: approver identifier',
            version: 'Optional: version string',
            publish_at: 'Optional: ISO 8601 date for scheduled publishing',
            expire_at: 'Optional: ISO 8601 date for scheduled expiry (must be after publish_at)',
          },
        },
        locale_strategies: {
          description: 'How localized content files are organized. Set per-model via locale_strategy field.',
          strategies: {
            file: {
              description: 'Default. Each locale is a separate file in the model directory.',
              json_pattern: '{content-dir}/{locale}.json (e.g. en.json, tr.json)',
              md_pattern: '{content-dir}/{slug}/{locale}.md',
            },
            suffix: {
              description: 'Locale appended to filename.',
              json_pattern: '{content-dir}/{model-id}.{locale}.json',
              md_pattern: '{content-dir}/{slug}.{locale}.md',
            },
            directory: {
              description: 'Locale as subdirectory.',
              json_pattern: '{content-dir}/{locale}/{model-id}.json',
              md_pattern: '{content-dir}/{locale}/{slug}.md',
            },
            none: {
              description: 'No locale in path (single-language or externally managed).',
              json_pattern: '{content-dir}/{model-id}.json',
              md_pattern: '{content-dir}/{slug}.md',
            },
          },
        },
        i18n_disabled: {
          description: 'When a model has i18n:false, locale is ignored in file paths.',
          json_pattern: '{content-dir}/data.json (always "data.json", no locale suffix)',
          md_pattern: '{content-dir}/{slug}.md (no locale in path)',
        },
        canonical_serialization: {
          description: 'All JSON files use deterministic serialization for clean git diffs.',
          rules: [
            'Object keys sorted alphabetically',
            '2-space indentation',
            'Trailing newline at end of file',
            'No trailing commas',
            'UTF-8 encoding',
          ],
        },
        content_path_override: {
          description: 'Models can specify a custom content_path to store content outside .contentrain/content/.',
          example: 'A model with content_path: "content/blog" stores files at {project-root}/content/blog/ instead of .contentrain/content/{domain}/{model-id}/',
          note: 'This is useful for frameworks that expect content in specific directories (e.g. Nuxt Content, Astro).',
        },
        reading_content: {
          steps: [
            '1. Read .contentrain/config.json to get locales and workflow settings',
            '2. Read .contentrain/models/{model-id}.json to get the schema and model kind',
            '3. Determine content directory: model.content_path or .contentrain/content/{domain}/{model-id}/',
            '4. Determine file path using locale_strategy and i18n flag',
            '5. Parse JSON (collection/singleton/dictionary) or Markdown frontmatter (document)',
            '6. Optionally read .contentrain/meta/{model-id}/{locale}.json for status/metadata',
          ],
        },
        vocabulary: {
          description: 'Canonical terms for content consistency across models and locales.',
          file: '.contentrain/vocabulary.json',
          format: {
            version: 'number',
            terms: 'Record<category, Record<slug, translation_value>>',
          },
          usage: [
            'Check vocabulary before creating dictionary entries — reuse canonical terms',
            'If a new term is needed, consider adding it to vocabulary first',
            'Vocabulary applies across ALL dictionary models and ALL locales',
          ],
        },
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(formatSpec, null, 2) }],
      }
    },
  )
}

async function getSample(
  reader: import('../core/contracts/index.js').RepoReader,
  model: import('@contentrain/types').ModelDefinition,
  locale: string,
): Promise<unknown> {
  const cDir = contentDirPath(model)

  if (model.kind === 'collection') {
    const data = await tryReadJson<Record<string, Record<string, unknown>>>(
      reader,
      contentFilePath(model, locale),
    )
    if (!data) return null
    const firstKey = Object.keys(data)[0]
    return firstKey ? { id: firstKey, ...data[firstKey] } : null
  }

  if (model.kind === 'singleton' || model.kind === 'dictionary') {
    return tryReadJson(reader, contentFilePath(model, locale))
  }

  if (model.kind === 'document') {
    const strategy = resolveLocaleStrategy(model)

    if (!model.i18n) {
      const entry = (await reader.listDirectory(cDir)).find(item => item.endsWith('.md'))
      const slug = entry?.replace(/\.md$/u, '')
      return slug ? { slug, locale } : null
    }

    if (strategy === 'file') {
      const slug = (await reader.listDirectory(cDir))[0]
      return slug ? { slug, locale } : null
    }

    if (strategy === 'suffix') {
      const suffix = `.${locale}.md`
      const entry = (await reader.listDirectory(cDir)).find(file => file.endsWith(suffix))
      const slug = entry?.slice(0, -suffix.length)
      return slug ? { slug, locale } : null
    }

    if (strategy === 'directory') {
      const entry = (await reader.listDirectory(`${cDir}/${locale}`)).find(item => item.endsWith('.md'))
      const slug = entry?.replace(/\.md$/u, '')
      return slug ? { slug, locale } : null
    }

    const entry = (await reader.listDirectory(cDir)).find(item => item.endsWith('.md'))
    const slug = entry?.replace(/\.md$/u, '')
    return slug ? { slug, locale } : null
  }

  return null
}

async function tryReadJson<T>(
  reader: import('../core/contracts/index.js').RepoReader,
  path: string,
): Promise<T | null> {
  try {
    return JSON.parse(await reader.readFile(path)) as T
  } catch {
    return null
  }
}

function buildContentPath(
  model: import('@contentrain/types').ModelDefinition,
  locale: string,
): string {
  const strategy = model.locale_strategy ?? 'file'
  const baseDir = model.content_path ?? `.contentrain/content/${model.domain}/${model.id}`

  if (model.kind === 'document') {
    // When i18n is disabled, documents are flat {slug}.md
    if (!model.i18n) return `${baseDir}/{slug}.md`

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
  // When i18n is disabled, always data.json
  if (!model.i18n) return `${baseDir}/data.json`

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
