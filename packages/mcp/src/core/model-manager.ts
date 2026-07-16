import type { ModelDefinition, ModelSummary } from '@contentrain/types'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { z } from 'zod'
import { contentrainDir, ensureDir, readDir, readJson, writeJson } from '../util/fs.js'
import type { RepoReader } from './contracts/index.js'
import { LocalReader } from '../providers/local/reader.js'
import { resolveContentDir, resolveLocaleStrategy } from './content-manager.js'
import { contentDirPath } from './ops/paths.js'

export type { ModelSummary } from '@contentrain/types'

const MODELS_DIR_PATH = '.contentrain/models'

async function tryReadJsonViaReader<T>(reader: RepoReader, path: string): Promise<T | null> {
  try {
    return JSON.parse(await reader.readFile(path)) as T
  } catch {
    return null
  }
}

/**
 * List every model defined under `.contentrain/models/*.json`.
 *
 * Accepts either a legacy `projectRoot` string (filesystem walk) or any
 * `RepoReader` — HTTP-hosted callers pass their `GitHubProvider` so the
 * same helper resolves model metadata over the Git Data API.
 */
export function listModels(projectRoot: string): Promise<ModelSummary[]>
export function listModels(reader: RepoReader): Promise<ModelSummary[]>
export async function listModels(input: string | RepoReader): Promise<ModelSummary[]> {
  let files: string[]
  let load: (file: string) => Promise<ModelDefinition | null>

  if (typeof input === 'string') {
    const modelsDir = join(contentrainDir(input), 'models')
    files = await readDir(modelsDir)
    load = file => readJson<ModelDefinition>(join(modelsDir, file))
  } else {
    files = await input.listDirectory(MODELS_DIR_PATH)
    load = file => tryReadJsonViaReader<ModelDefinition>(input, `${MODELS_DIR_PATH}/${file}`)
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'))
  const models = await Promise.all(jsonFiles.map(load))

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

/**
 * Read a single model definition. Same dual signature as {@link listModels}.
 */
export function readModel(projectRoot: string, modelId: string): Promise<ModelDefinition | null>
export function readModel(reader: RepoReader, modelId: string): Promise<ModelDefinition | null>
export async function readModel(input: string | RepoReader, modelId: string): Promise<ModelDefinition | null> {
  if (typeof input === 'string') {
    const filePath = join(contentrainDir(input), 'models', `${modelId}.json`)
    return readJson<ModelDefinition>(filePath)
  }
  return tryReadJsonViaReader<ModelDefinition>(input, `${MODELS_DIR_PATH}/${modelId}.json`)
}

async function countDocumentFileStrategy(
  reader: RepoReader,
  contentDir: string,
  entries: string[],
): Promise<{ total: number, locales: Record<string, number> }> {
  const locales: Record<string, number> = {}
  let total = 0

  const results = await Promise.all(
    entries.map(async (entry) => {
      const localeFiles = await reader.listDirectory(`${contentDir}/${entry}`)
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
  _reader: RepoReader,
  _contentDir: string,
  files: string[],
): Promise<{ total: number, locales: Record<string, number> }> {
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
  reader: RepoReader,
  contentDir: string,
  localeDirs: string[],
): Promise<{ total: number, locales: Record<string, number> }> {
  const locales: Record<string, number> = {}
  let total = 0

  const results = await Promise.all(
    localeDirs.map(async (localeDir) => {
      const files = await reader.listDirectory(`${contentDir}/${localeDir}`)
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
  reader: RepoReader,
  modelId: string,
  files: string[],
  i18n: boolean,
): Promise<{ total: number, locales: Record<string, number> }> {
  const mdFiles = files.filter(f => f.endsWith('.md'))

  if (!i18n) {
    return { total: mdFiles.length, locales: { _: mdFiles.length } }
  }

  // With i18n + none strategy, content files have no locale info.
  // Use meta/{modelId}/{slug}/ directories to determine locale counts.
  const metaDir = `.contentrain/meta/${modelId}`
  const locales: Record<string, number> = {}
  let total = 0

  const slugs = mdFiles.map(f => f.replace('.md', ''))
  const results = await Promise.all(
    slugs.map(async (slug) => {
      const metaFiles = await reader.listDirectory(`${metaDir}/${slug}`)
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
  reader: RepoReader,
  contentDir: string,
  jsonFiles: string[],
): Promise<{ total: number, locales: Record<string, number> }> {
  const locales: Record<string, number> = {}
  let total = 0

  const results = await Promise.all(
    jsonFiles.map(async (file) => {
      const locale = file.replace(/\.json$/, '')
      const data = await tryReadJsonViaReader<Record<string, unknown>>(reader, `${contentDir}/${file}`)
      return { locale, count: data ? Object.keys(data).length : 0 }
    }),
  )

  for (const { locale, count } of results) {
    locales[locale] = count
    total += count
  }

  return { total, locales }
}

/**
 * Count content entries across locales for a model.
 *
 * Accepts either a legacy `projectRoot` string (wraps LocalReader internally)
 * or any `RepoReader` — so remote providers (GitHubProvider) feed the same
 * counting logic via the Git Data API.
 */
export function countEntries(
  projectRoot: string,
  model: ModelDefinition,
): Promise<{ total: number, locales: Record<string, number> }>
export function countEntries(
  reader: RepoReader,
  model: ModelDefinition,
): Promise<{ total: number, locales: Record<string, number> }>
export async function countEntries(
  input: string | RepoReader,
  model: ModelDefinition,
): Promise<{ total: number, locales: Record<string, number> }> {
  const reader: RepoReader = typeof input === 'string' ? new LocalReader(input) : input
  const cDir = contentDirPath(model)
  const strategy = resolveLocaleStrategy(model)
  const files = await reader.listDirectory(cDir)

  if (model.kind === 'document') {
    if (!model.i18n) {
      // No i18n: flat {slug}.md files
      return countDocumentNoneStrategy(reader, model.id, files, false)
    }

    switch (strategy) {
      case 'file':
        return countDocumentFileStrategy(reader, cDir, files)
      case 'suffix':
        return countDocumentSuffixStrategy(reader, cDir, files)
      case 'directory':
        return countDocumentDirectoryStrategy(reader, cDir, files)
      case 'none':
        return countDocumentNoneStrategy(reader, model.id, files, true)
    }
  }

  if (model.kind === 'collection') {
    if (!model.i18n) {
      // Non-i18n: single data.json
      const jsonFiles = files.filter(f => f.endsWith('.json'))
      return countCollectionEntries(reader, cDir, jsonFiles)
    }
    switch (strategy) {
      case 'suffix': {
        // Files: {model}.{locale}.json
        const jsonFiles = files.filter(f => f.endsWith('.json'))
        const locales: Record<string, number> = {}
        for (const f of jsonFiles) {
          const match = f.match(/^.+\.([a-z]{2}(?:-[A-Z]{2})?)\.json$/)
          if (match) {
            const data = await tryReadJsonViaReader<Record<string, unknown>>(reader, `${cDir}/${f}`)
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
          const subFiles = await reader.listDirectory(`${cDir}/${localeDir}`)
          const jsonFile = subFiles.find(f => f.endsWith('.json'))
          if (jsonFile) {
            const data = await tryReadJsonViaReader<Record<string, unknown>>(reader, `${cDir}/${localeDir}/${jsonFile}`)
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
        const data = await tryReadJsonViaReader<Record<string, unknown>>(reader, `${cDir}/${noneFile}`)
        const count = data ? Object.keys(data).length : 0
        return { total: count, locales: { _: count } }
      }
      default: {
        // 'file': {locale}.json
        const jsonFiles = files.filter(f => f.endsWith('.json'))
        return countCollectionEntries(reader, cDir, jsonFiles)
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
        const subFiles = await reader.listDirectory(`${cDir}/${localeDir}`)
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

/**
 * Enumerate models that reference `modelId` through relation or relations
 * fields. Used by `model_delete` to block destructive deletes when other
 * models still depend on the target.
 *
 * Accepts either a legacy `projectRoot` string (LocalReader wraps internally)
 * or any `RepoReader` — remote providers get the same pre-check.
 */
export function checkReferences(projectRoot: string, modelId: string): Promise<ModelReference[]>
export function checkReferences(reader: RepoReader, modelId: string): Promise<ModelReference[]>
export async function checkReferences(
  input: string | RepoReader,
  modelId: string,
): Promise<ModelReference[]> {
  const summaries = typeof input === 'string' ? await listModels(input) : await listModels(input)
  const others = summaries.filter(s => s.id !== modelId)

  const models = await Promise.all(
    others.map(s => typeof input === 'string' ? readModel(input, s.id) : readModel(input, s.id)),
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

// ─── Shared Field Type Catalog ───

export const FIELD_TYPE_ENUM = [
  'string', 'text', 'email', 'url', 'slug', 'color', 'phone', 'code', 'icon',
  'markdown', 'richtext',
  'number', 'integer', 'decimal', 'percent', 'rating',
  'boolean', 'date', 'datetime',
  'image', 'video', 'file',
  'relation', 'relations',
  'select', 'array', 'object',
] as const

/**
 * Shared Zod schema for field definitions.
 * Used by both model_save and normalize extract for full parity.
 *
 * `.strict()` is load-bearing: the default `z.object` *strips* unknown keys, so a
 * typo'd constraint (`requird: true`) used to vanish without a word and the field
 * silently lost the rule its author thought they had declared.
 */
export const fieldDefZodSchema: z.ZodType<Record<string, unknown>> = z.record(z.string(), z.object({
  type: z.enum(FIELD_TYPE_ENUM).describe('Field type from the 27-type catalog'),
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
}).strict().refine(
  (f) => {
    if ((f.type === 'relation' || f.type === 'relations') && !f.model) return false
    if (f.type === 'select' && (!f.options || f.options.length === 0)) return false
    return true
  },
  { message: 'relation/relations requires "model", select requires non-empty "options"' },
))

// ─── Model Validation (shared between model_save and normalize extract) ───

const VALID_FIELD_TYPES = new Set<string>(FIELD_TYPE_ENUM)

/** Field types whose value is a path/URL to a media asset. */
const MEDIA_FIELD_TYPES = new Set<string>(['image', 'video', 'file'])
/** Bounds `items`/`fields` nesting; far above any real schema. */
const MAX_SCHEMA_DEPTH = 10

export interface ModelDefinitionIssues {
  /** Block the write. */
  errors: string[]
  /** Surface to the caller; the write proceeds. */
  warnings: string[]
}

interface RawFieldDef {
  type?: string
  required?: unknown
  unique?: unknown
  default?: unknown
  min?: unknown
  max?: unknown
  pattern?: unknown
  options?: unknown
  model?: unknown
  items?: unknown
  fields?: unknown
  accept?: unknown
  maxSize?: unknown
}

/**
 * Check one field definition, recursing into `fields` and `items`.
 *
 * The governing rule: **do not accept a constraint that will not be enforced.**
 * A constraint that silently does nothing is worse than no constraint, because
 * the author stops looking. So a property declared where it cannot apply is an
 * error, and a property we genuinely cannot enforce says so out loud.
 */
function checkFieldDef(
  raw: unknown,
  path: string,
  modelKind: string,
  errors: string[],
  warnings: string[],
  depth: number,
): void {
  if (typeof raw !== 'object' || raw === null) {
    errors.push(`Field "${path}": must be an object`)
    return
  }
  if (depth > MAX_SCHEMA_DEPTH) {
    errors.push(`Field "${path}": exceeds the maximum nesting depth of ${MAX_SCHEMA_DEPTH}`)
    return
  }

  const def = raw as RawFieldDef
  const type = def.type

  if (!type || !VALID_FIELD_TYPES.has(type)) {
    errors.push(`Field "${path}": invalid type "${type}"`)
    return
  }

  if ((type === 'relation' || type === 'relations') && !def.model) {
    errors.push(`Field "${path}": ${type} type requires "model" property`)
  }
  if (type === 'select' && (!Array.isArray(def.options) || def.options.length === 0)) {
    errors.push(`Field "${path}": select type requires non-empty "options" array`)
  }
  // The reverse direction was never checked, so `options` on a string field was
  // accepted and then silently ignored at validation time.
  if (def.options !== undefined && type !== 'select') {
    errors.push(`Field "${path}": "options" only applies to select fields — it is ignored on "${type}"`)
  }
  if (def.items !== undefined && type !== 'array') {
    errors.push(`Field "${path}": "items" only applies to array fields — it is ignored on "${type}"`)
  }
  if (def.fields !== undefined && type !== 'object') {
    errors.push(`Field "${path}": "fields" only applies to object fields — it is ignored on "${type}"`)
  }
  if (def.accept !== undefined && !MEDIA_FIELD_TYPES.has(type)) {
    errors.push(`Field "${path}": "accept" only applies to image/video/file fields — it is ignored on "${type}"`)
  }
  if (def.maxSize !== undefined && !MEDIA_FIELD_TYPES.has(type)) {
    errors.push(`Field "${path}": "maxSize" only applies to image/video/file fields — it is ignored on "${type}"`)
  }

  // A singleton holds one record per locale, so there is nothing for a value to
  // be unique against.
  if (def.unique === true && modelKind === 'singleton') {
    errors.push(`Field "${path}": "unique" has no meaning on a singleton — the model holds a single record per locale`)
  }

  if (typeof def.min === 'number' && typeof def.max === 'number' && def.min > def.max) {
    errors.push(`Field "${path}": min (${def.min}) is greater than max (${def.max})`)
  }

  // Compile the regex here rather than let it fail once per entry at validation
  // time, where it degrades to a warning and silently disables the constraint.
  if (typeof def.pattern === 'string') {
    try {
      // eslint-disable-next-line no-new
      new RegExp(def.pattern)
    } catch {
      errors.push(`Field "${path}": "pattern" is not a valid regular expression — /${def.pattern}/`)
    }
  }

  if (def.default !== undefined) {
    checkDefaultCoherence(def, type, path, errors)
  }

  // `max` on a media field measures the length of the stored path string, not
  // the file — almost certainly not what the author meant.
  if (typeof def.max === 'number' && MEDIA_FIELD_TYPES.has(type)) {
    warnings.push(
      `Field "${path}": "max" on a ${type} field limits the length of the stored path string, not the file size. Use "maxSize" for bytes.`,
    )
  }

  // Said plainly rather than accepted in silence: MCP holds a path, never the
  // bytes, so it cannot check this. The provider owns the policy at ingest.
  if (def.maxSize !== undefined && MEDIA_FIELD_TYPES.has(type)) {
    warnings.push(
      `Field "${path}": "maxSize" is not enforced by MCP — it has no access to the file. Your media provider enforces it when the asset is ingested.`,
    )
  }

  if (def.fields !== undefined && typeof def.fields === 'object' && def.fields !== null) {
    for (const [nested, nestedDef] of Object.entries(def.fields as Record<string, unknown>)) {
      if (!/^[a-z][a-z0-9_]*$/.test(nested)) {
        errors.push(`Field "${path}.${nested}": invalid name — must be snake_case starting with letter`)
      }
      checkFieldDef(nestedDef, `${path}.${nested}`, modelKind, errors, warnings, depth + 1)
    }
  }

  if (typeof def.items === 'string') {
    if (!VALID_FIELD_TYPES.has(def.items)) {
      errors.push(`Field "${path}.items": invalid type "${def.items}"`)
    }
  } else if (def.items !== undefined) {
    checkFieldDef(def.items, `${path}.items`, modelKind, errors, warnings, depth + 1)
  }
}

/** A default that its own field would reject is a schema bug, not a content one. */
function checkDefaultCoherence(def: RawFieldDef, type: string, path: string, errors: string[]): void {
  const value = def.default
  const isString = typeof value === 'string'
  const isNumber = typeof value === 'number'

  if (type === 'select' && Array.isArray(def.options) && isString && !def.options.includes(value)) {
    errors.push(`Field "${path}": default "${value}" is not one of its own options [${(def.options as string[]).join(', ')}]`)
    return
  }
  const wantsNumber = ['number', 'integer', 'decimal', 'percent', 'rating'].includes(type)
  const wantsBoolean = type === 'boolean'
  const wantsArray = type === 'array'

  if (wantsNumber && !isNumber) {
    errors.push(`Field "${path}": default must be a number for type "${type}"`)
  } else if (wantsBoolean && typeof value !== 'boolean') {
    errors.push(`Field "${path}": default must be a boolean for type "${type}"`)
  } else if (wantsArray && !Array.isArray(value)) {
    errors.push(`Field "${path}": default must be an array for type "${type}"`)
  }
}

/**
 * Validate a model definition before writing.
 * Used by both the model_save tool and normalize extract.
 */
export function validateModelDefinition(
  input: { id: string; kind: string; fields?: Record<string, unknown> },
): ModelDefinitionIssues {
  const errors: string[] = []
  const warnings: string[] = []

  // ID format: kebab-case
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id)) {
    errors.push(`Invalid model ID "${input.id}": must be kebab-case`)
  }

  // Dictionary models cannot have fields
  if (input.kind === 'dictionary' && input.fields && Object.keys(input.fields).length > 0) {
    errors.push('Dictionary models cannot have fields. Dictionaries store flat key-value pairs.')
  }

  if (input.fields) {
    for (const [fieldName, fieldDef] of Object.entries(input.fields)) {
      if (!/^[a-z][a-z0-9_]*$/.test(fieldName)) {
        errors.push(`Field "${fieldName}": invalid name — must be snake_case starting with letter`)
      }
      checkFieldDef(fieldDef, fieldName, input.kind, errors, warnings, 0)
    }
  }

  return { errors, warnings }
}
