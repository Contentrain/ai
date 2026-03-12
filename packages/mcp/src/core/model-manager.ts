import type { ModelDefinition } from '@contentrain/types'
import { join } from 'node:path'
import { contentrainDir, readDir, readJson } from '../util/fs.js'

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
    .toSorted((a, b) => a.id.localeCompare(b.id))
}

export async function readModel(projectRoot: string, modelId: string): Promise<ModelDefinition | null> {
  const filePath = join(contentrainDir(projectRoot), 'models', `${modelId}.json`)
  return readJson<ModelDefinition>(filePath)
}

async function countDocumentEntries(
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
  const contentDir = join(contentrainDir(projectRoot), 'content', model.domain, model.id)
  const files = await readDir(contentDir)

  if (model.kind === 'document') {
    return countDocumentEntries(contentDir, files)
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'))

  if (model.kind === 'collection') {
    return countCollectionEntries(contentDir, jsonFiles)
  }

  // singleton / dictionary — one entry per locale file
  const locales: Record<string, number> = {}
  for (const file of jsonFiles) {
    locales[file.replace(/\.json$/, '')] = 1
  }
  return { total: jsonFiles.length, locales }
}
