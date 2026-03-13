import type { ModelDefinition } from '@contentrain/types'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { contentrainDir, ensureDir, readDir, readJson, writeJson } from '../util/fs.js'
import { resolveContentDir, resolveLocaleStrategy } from './content-manager.js'

export interface ModelSummary {
  id: string
  kind: ModelDefinition['kind']
  domain: string
  i18n: boolean
  fields: number
}

export async function listModels(projectRoot: string): Promise<ModelSummary[]> {
  const modelsDir = join(contentrainDir(projectRoot), 'models')
  const files = await readDir(modelsDir)
  const jsonFiles = files.filter(f => f.endsWith('.json'))

  const models = await Promise.all(
    jsonFiles.map(file => readJson<ModelDefinition>(join(modelsDir, file))),
  )

  return models
    .filter((m): m is ModelDefinition => m !== null && !!m.id)
    .map(model => ({
      id: model.id,
      kind: model.kind,
      domain: model.domain,
      i18n: model.i18n,
      fields: model.fields ? Object.keys(model.fields).length : 0,
    }))
    .toSorted((a, b) => a.id.localeCompare(b.id, 'en'))
}

export async function readModel(projectRoot: string, modelId: string): Promise<ModelDefinition | null> {
  const filePath = join(contentrainDir(projectRoot), 'models', `${modelId}.json`)
  return readJson<ModelDefinition>(filePath)
}

async function countDocumentFileStrategy(
  contentDir: string,
  entries: string[],
): Promise<{ total: number; locales: Record<string, number> }> {
  const locales: Record<string, number> = {}
  let total = 0

  const results = await Promise.all(
    entries.map(async (entry) => {
      const localeFiles = await readDir(join(contentDir, entry))
      return localeFiles
        .map(lf => lf.replace(/\.(json|md|mdx)$/, ''))
        .filter((locale, i) => locale !== localeFiles[i])
    }),
  )

  for (const entryLocales of results) {
    for (const locale of entryLocales) {
      locales[locale] = (locales[locale] ?? 0) + 1
      total++
    }
  }

  return { total, locales }
}

async function countDocumentSuffixStrategy(
  contentDir: string,
  files: string[],
): Promise<{ total: number; locales: Record<string, number> }> {
  const locales: Record<string, number> = {}
  const slugsByLocale: Record<string, Set<string>> = {}

  for (const f of files) {
    if (!f.endsWith('.md')) continue
    // Pattern: {slug}.{locale}.md
    const match = f.match(/^(.+)\.([a-z]{2}(?:-[A-Z]{2})?)\.md$/)
    if (!match) continue
    const locale = match[2]!
    if (!slugsByLocale[locale]) slugsByLocale[locale] = new Set()
    slugsByLocale[locale].add(match[1]!)
  }

  let total = 0
  for (const [locale, slugs] of Object.entries(slugsByLocale)) {
    locales[locale] = slugs.size
    total += slugs.size
  }

  return { total, locales }
}

async function countDocumentDirectoryStrategy(
  contentDir: string,
  localeDirs: string[],
): Promise<{ total: number; locales: Record<string, number> }> {
  const locales: Record<string, number> = {}
  let total = 0

  const results = await Promise.all(
    localeDirs.map(async (localeDir) => {
      const files = await readDir(join(contentDir, localeDir))
      const mdFiles = files.filter(f => f.endsWith('.md'))
      return { locale: localeDir, count: mdFiles.length }
    }),
  )

  for (const { locale, count } of results) {
    locales[locale] = count
    total += count
  }

  return { total, locales }
}

async function countDocumentNoneStrategy(
  projectRoot: string,
  modelId: string,
  files: string[],
  i18n: boolean,
): Promise<{ total: number; locales: Record<string, number> }> {
  const mdFiles = files.filter(f => f.endsWith('.md'))

  if (!i18n) {
    return { total: mdFiles.length, locales: { _: mdFiles.length } }
  }

  // With i18n + none strategy, content files have no locale info.
  // Use meta/{modelId}/{slug}/ directories to determine locale counts.
  const metaDir = join(contentrainDir(projectRoot), 'meta', modelId)
  const locales: Record<string, number> = {}
  let total = 0

  const slugs = mdFiles.map(f => f.replace('.md', ''))
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const metaFiles = await readDir(join(metaDir, slug))
      return metaFiles
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''))
    }),
  )

  for (const slugLocales of results) {
    for (const locale of slugLocales) {
      locales[locale] = (locales[locale] ?? 0) + 1
      total++
    }
  }

  return { total, locales }
}

async function countCollectionEntries(
  contentDir: string,
  jsonFiles: string[],
): Promise<{ total: number; locales: Record<string, number> }> {
  const locales: Record<string, number> = {}
  let total = 0

  const results = await Promise.all(
    jsonFiles.map(async (file) => {
      const locale = file.replace(/\.json$/, '')
      const data = await readJson<Record<string, unknown>>(join(contentDir, file))
      return { locale, count: data ? Object.keys(data).length : 0 }
    }),
  )

  for (const { locale, count } of results) {
    locales[locale] = count
    total += count
  }

  return { total, locales }
}

export async function countEntries(
  projectRoot: string,
  model: ModelDefinition,
): Promise<{ total: number; locales: Record<string, number> }> {
  const cDir = resolveContentDir(projectRoot, model)
  const strategy = resolveLocaleStrategy(model)
  const files = await readDir(cDir)

  if (model.kind === 'document') {
    if (!model.i18n) {
      // No i18n: flat {slug}.md files
      return countDocumentNoneStrategy(projectRoot, model.id, files, false)
    }

    switch (strategy) {
      case 'file':
        return countDocumentFileStrategy(cDir, files)
      case 'suffix':
        return countDocumentSuffixStrategy(cDir, files)
      case 'directory':
        return countDocumentDirectoryStrategy(cDir, files)
      case 'none':
        return countDocumentNoneStrategy(projectRoot, model.id, files, true)
    }
  }

  if (model.kind === 'collection') {
    if (!model.i18n) {
      // Non-i18n: single data.json
      const jsonFiles = files.filter(f => f.endsWith('.json'))
      return countCollectionEntries(cDir, jsonFiles)
    }
    switch (strategy) {
      case 'suffix': {
        // Files: {model}.{locale}.json
        const jsonFiles = files.filter(f => f.endsWith('.json'))
        const locales: Record<string, number> = {}
        for (const f of jsonFiles) {
          const match = f.match(/^.+\.([a-z]{2}(?:-[A-Z]{2})?)\.json$/)
          if (match) {
            const data = await readJson<Record<string, unknown>>(join(cDir, f))
            locales[match[1]!] = data ? Object.keys(data).length : 0
          }
        }
        const total = Object.values(locales).reduce((a, b) => a + b, 0)
        return { total, locales }
      }
      case 'directory': {
        // Dirs: {locale}/... containing json files
        const locales: Record<string, number> = {}
        let total = 0
        for (const localeDir of files) {
          const subFiles = await readDir(join(cDir, localeDir))
          const jsonFile = subFiles.find(f => f.endsWith('.json'))
          if (jsonFile) {
            const data = await readJson<Record<string, unknown>>(join(cDir, localeDir, jsonFile))
            const count = data ? Object.keys(data).length : 0
            locales[localeDir] = count
            total += count
          }
        }
        return { total, locales }
      }
      case 'none': {
        // Single file: {model}.json — count entries inside
        const noneFile = files.find(f => f === `${model.id}.json`)
        if (!noneFile) return { total: 0, locales: {} }
        const data = await readJson<Record<string, unknown>>(join(cDir, noneFile))
        const count = data ? Object.keys(data).length : 0
        return { total: count, locales: { _: count } }
      }
      default: {
        // 'file': {locale}.json
        const jsonFiles = files.filter(f => f.endsWith('.json'))
        return countCollectionEntries(cDir, jsonFiles)
      }
    }
  }

  // singleton / dictionary — one entry per locale file
  if (!model.i18n) {
    // Non-i18n: single data.json
    const hasData = files.some(f => f === 'data.json')
    return { total: hasData ? 1 : 0, locales: {} }
  }

  switch (strategy) {
    case 'suffix': {
      // Files: {model}.{locale}.json
      const locales: Record<string, number> = {}
      for (const f of files) {
        const match = f.match(/^.+\.([a-z]{2}(?:-[A-Z]{2})?)\.json$/)
        if (match) locales[match[1]!] = 1
      }
      return { total: Object.keys(locales).length, locales }
    }
    case 'directory': {
      // Dirs: {locale}/...
      const locales: Record<string, number> = {}
      for (const localeDir of files) {
        const subFiles = await readDir(join(cDir, localeDir))
        if (subFiles.some(f => f.endsWith('.json'))) {
          locales[localeDir] = 1
        }
      }
      return { total: Object.keys(locales).length, locales }
    }
    case 'none': {
      // Single file: {model}.json
      const hasFile = files.some(f => f === `${model.id}.json`)
      return { total: hasFile ? 1 : 0, locales: {} }
    }
    default: {
      // 'file': {locale}.json
      const jsonFiles = files.filter(f => f.endsWith('.json'))
      const locales: Record<string, number> = {}
      for (const file of jsonFiles) {
        locales[file.replace(/\.json$/, '')] = 1
      }
      return { total: jsonFiles.length, locales }
    }
  }
}

const MODEL_FIELD_ORDER = ['id', 'name', 'kind', 'domain', 'i18n', 'description', 'content_path', 'locale_strategy', 'fields']

export async function writeModel(projectRoot: string, model: ModelDefinition): Promise<void> {
  const filePath = join(contentrainDir(projectRoot), 'models', `${model.id}.json`)
  await writeJson(filePath, model, MODEL_FIELD_ORDER)

  // Ensure content and meta directories exist (respects content_path)
  await ensureDir(resolveContentDir(projectRoot, model))
  await ensureDir(join(contentrainDir(projectRoot), 'meta', model.id))
}

export async function deleteModel(projectRoot: string, modelId: string): Promise<string[]> {
  const model = await readModel(projectRoot, modelId)
  if (!model) return []

  const crDir = contentrainDir(projectRoot)
  const removed: string[] = []

  const modelPath = join(crDir, 'models', `${modelId}.json`)
  const contentPath = resolveContentDir(projectRoot, model)
  const metaPath = join(crDir, 'meta', modelId)

  await rm(modelPath, { force: true })
  removed.push(`models/${modelId}.json`)

  try {
    await rm(contentPath, { recursive: true, force: true })
    removed.push(model.content_path ?? `content/${model.domain}/${modelId}/`)
  } catch {
    // directory may not exist
  }

  try {
    await rm(metaPath, { recursive: true, force: true })
    removed.push(`meta/${modelId}/`)
  } catch {
    // directory may not exist
  }

  return removed
}

export interface ModelReference {
  model: string
  field: string
  type: 'relation' | 'relations'
}

export async function checkReferences(projectRoot: string, modelId: string): Promise<ModelReference[]> {
  const summaries = await listModels(projectRoot)
  const others = summaries.filter(s => s.id !== modelId)

  const models = await Promise.all(
    others.map(s => readModel(projectRoot, s.id)),
  )

  const refs: ModelReference[] = []
  for (const model of models) {
    if (!model?.fields) continue

    for (const [fieldName, fieldDef] of Object.entries(model.fields)) {
      if (fieldDef.type !== 'relation' && fieldDef.type !== 'relations') continue
      const targets = Array.isArray(fieldDef.model) ? fieldDef.model : [fieldDef.model]
      if (targets.includes(modelId)) {
        refs.push({ model: model.id, field: fieldName, type: fieldDef.type })
      }
    }
  }

  return refs
}
