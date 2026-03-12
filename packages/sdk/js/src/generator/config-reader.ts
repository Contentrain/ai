import type { ContentrainConfig, ModelDefinition, LocaleStrategy } from '@contentrain/types'
import { join } from 'node:path'
import { readJson, readDir, readText, contentrainDir } from './utils.js'

export interface ContentFileRef {
  modelId: string
  locale: string | null
  filePath: string
  kind: ModelDefinition['kind']
  /** Extracted slug for document kind (from filename, not frontmatter) */
  slug?: string
}

export interface ProjectManifest {
  config: ContentrainConfig
  models: ModelDefinition[]
  contentFiles: ContentFileRef[]
}

export async function readProjectManifest(projectRoot: string): Promise<ProjectManifest> {
  const crDir = contentrainDir(projectRoot)

  // 1. Read config
  const rawConfig = await readJson<Partial<ContentrainConfig>>(join(crDir, 'config.json'))
  const config: ContentrainConfig = {
    version: rawConfig?.version ?? 1,
    stack: (rawConfig?.stack ?? 'other') as ContentrainConfig['stack'],
    workflow: (rawConfig?.workflow ?? 'auto-merge') as ContentrainConfig['workflow'],
    locales: {
      default: rawConfig?.locales?.default ?? 'en',
      supported: rawConfig?.locales?.supported ?? [rawConfig?.locales?.default ?? 'en'],
    },
    domains: rawConfig?.domains ?? [],
    repository: rawConfig?.repository,
    assets_path: rawConfig?.assets_path,
    branchRetention: rawConfig?.branchRetention,
  }

  // 2. Read all models (parallel)
  const modelsDir = join(crDir, 'models')
  const modelFiles = (await readDir(modelsDir)).filter(f => f.endsWith('.json'))
  const modelResults = await Promise.all(
    modelFiles.map(file => readJson<ModelDefinition>(join(modelsDir, file))),
  )
  const models = modelResults
    .filter((m): m is ModelDefinition => m != null && Boolean(m.id))
    .toSorted((a, b) => a.id.localeCompare(b.id, 'en'))

  // 3. Map content files (parallel per model)
  const allRefs = await Promise.all(
    models.map(model => mapContentFiles(projectRoot, model, config)),
  )
  const contentFiles = allRefs.flat()

  return { config, models, contentFiles }
}

function getContentDir(projectRoot: string, model: ModelDefinition): string {
  if (model.content_path) return join(projectRoot, model.content_path)
  return join(contentrainDir(projectRoot), 'content', model.domain, model.id)
}

function getLocaleStrategy(model: ModelDefinition): LocaleStrategy {
  return model.locale_strategy ?? 'file'
}

function jsonFilePath(dir: string, model: ModelDefinition, locale: string): string {
  const strategy = getLocaleStrategy(model)
  switch (strategy) {
    case 'suffix': return join(dir, `${model.id}.${locale}.json`)
    case 'directory': return join(dir, locale, `${model.id}.json`)
    case 'none': return join(dir, `${model.id}.json`)
    case 'file':
    default: return join(dir, `${locale}.json`)
  }
}

async function mapContentFiles(
  projectRoot: string,
  model: ModelDefinition,
  config: ContentrainConfig,
): Promise<ContentFileRef[]> {
  const dir = getContentDir(projectRoot, model)

  if (model.kind === 'document') {
    return mapDocumentFiles(dir, model, config)
  }

  // JSON-based models (singleton, collection, dictionary)
  if (model.i18n) {
    const results = await Promise.all(
      config.locales.supported.map(async (locale) => {
        const filePath = jsonFilePath(dir, model, locale)
        const content = await readJson(filePath)
        if (content === null) return null
        return { modelId: model.id, locale, filePath, kind: model.kind } as ContentFileRef
      }),
    )
    return results.filter(Boolean) as ContentFileRef[]
  }

  // Non-i18n: use default locale to resolve correct file path
  const filePath = jsonFilePath(dir, model, config.locales.default)
  const content = await readJson(filePath)
  if (content === null) return []
  return [{ modelId: model.id, locale: null, filePath, kind: model.kind }]
}

async function mapDocumentFiles(
  dir: string,
  model: ModelDefinition,
  config: ContentrainConfig,
): Promise<ContentFileRef[]> {
  const strategy = getLocaleStrategy(model)

  if (!model.i18n) {
    // Non-i18n documents: {dir}/{slug}.md
    const files = (await readDir(dir)).filter(f => f.endsWith('.md'))
    return files.map(f => ({
      modelId: model.id,
      locale: null,
      filePath: join(dir, f),
      kind: 'document' as const,
      slug: f.replace('.md', ''),
    }))
  }

  // i18n documents — resolve per locale in parallel
  const allLocaleRefs = await Promise.all(
    config.locales.supported.map(locale => mapDocumentLocale(dir, model, locale, strategy)),
  )
  return allLocaleRefs.flat()
}

async function mapDocumentLocale(
  dir: string,
  model: ModelDefinition,
  locale: string,
  strategy: LocaleStrategy,
): Promise<ContentFileRef[]> {
  if (strategy === 'file') {
    // Each slug is a directory: {dir}/{slug}/{locale}.md
    const entries = await readDir(dir)
    const results = await Promise.all(
      entries.map(async (entry) => {
        const filePath = join(dir, entry, `${locale}.md`)
        const content = await readText(filePath)
        if (content === null) return null
        return { modelId: model.id, locale, filePath, kind: 'document', slug: entry } as ContentFileRef
      }),
    )
    return results.filter(Boolean) as ContentFileRef[]
  }

  if (strategy === 'directory') {
    // {dir}/{locale}/{slug}.md
    const localeDir = join(dir, locale)
    const files = (await readDir(localeDir)).filter(f => f.endsWith('.md'))
    return files.map(f => ({
      modelId: model.id,
      locale,
      filePath: join(localeDir, f),
      kind: 'document' as const,
      slug: f.replace('.md', ''),
    }))
  }

  if (strategy === 'suffix') {
    // {dir}/{slug}.{locale}.md
    const suffix = `.${locale}.md`
    const files = (await readDir(dir)).filter(f => f.endsWith(suffix))
    return files.map(f => ({
      modelId: model.id,
      locale,
      filePath: join(dir, f),
      kind: 'document' as const,
      slug: f.slice(0, -suffix.length),
    }))
  }

  return []
}
