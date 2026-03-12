import type { ModelDefinition, ContentrainConfig, EntryMeta } from '@contentrain/types'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { contentrainDir, readDir, readJson, readText, writeJson, writeText } from '../util/fs.js'
import { generateEntryId } from '../util/id.js'
import { writeMeta, deleteMeta } from './meta-manager.js'
import { readModel } from './model-manager.js'

// ─── Frontmatter helpers ───

export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }

  const frontmatterStr = match[1]!
  const body = match[2]!.trim()
  const frontmatter: Record<string, unknown> = {}

  let currentKey: string | null = null
  let currentArray: string[] | null = null

  for (const line of frontmatterStr.split('\n')) {
    // Array item
    if (/^\s+-\s+/.test(line) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim()
      if (!currentArray) currentArray = []
      currentArray.push(value)
      continue
    }

    // Flush previous array
    if (currentKey && currentArray) {
      frontmatter[currentKey] = currentArray
      currentKey = null
      currentArray = null
    }

    const kvMatch = line.match(/^([\w][\w.-]*)\s*:\s*(.*)$/)
    if (!kvMatch) continue

    const key = kvMatch[1]!
    const rawValue = kvMatch[2]!.trim()

    if (rawValue === '') {
      currentKey = key
      currentArray = []
      continue
    }

    // Inline array: [item1, item2]
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const items = rawValue.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      frontmatter[key] = items
      continue
    }

    frontmatter[key] = parseYamlValue(rawValue)
  }

  // Flush last array
  if (currentKey && currentArray) {
    frontmatter[currentKey] = currentArray
  }

  return { frontmatter, body }
}

function parseYamlValue(raw: string): unknown {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const lines: string[] = ['---']

  for (const [key, value] of Object.entries(data)) {
    if (key === 'body') continue
    if (value === null || value === undefined) continue

    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) {
        lines.push(`  - ${String(item)}`)
      }
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }

  lines.push('---')
  lines.push('')

  if (body) {
    lines.push(body)
    lines.push('')
  }

  return lines.join('\n')
}

// ─── Content paths ───

function contentDir(projectRoot: string, model: ModelDefinition): string {
  return join(contentrainDir(projectRoot), 'content', model.domain, model.id)
}

// ─── Types ───

export interface ContentEntry {
  id?: string
  slug?: string
  locale?: string
  data: Record<string, unknown>
}

export interface WriteResult {
  action: 'created' | 'updated'
  id?: string
  slug?: string
  locale: string
}

export interface DeleteOpts {
  id?: string
  slug?: string
  locale?: string
}

export interface ListOpts {
  locale?: string
  filter?: Record<string, unknown>
  resolve?: boolean
  limit?: number
  offset?: number
}

// ─── Default meta ───

function defaultMeta(): EntryMeta {
  return {
    status: 'draft',
    source: 'agent',
    updated_by: 'contentrain-mcp',
  }
}

// ─── writeContent ───

export async function writeContent(
  projectRoot: string,
  model: ModelDefinition,
  entries: ContentEntry[],
  config: ContentrainConfig,
): Promise<WriteResult[]> {
  const results: WriteResult[] = []
  const defaultLocale = config.locales.default

  for (const entry of entries) {
    const locale = entry.locale ?? defaultLocale

    switch (model.kind) {
      case 'singleton': {
        const filePath = join(contentDir(projectRoot, model), `${locale}.json`)
        await writeJson(filePath, entry.data)
        await writeMeta(projectRoot, model, { locale }, defaultMeta())
        results.push({ action: 'updated', locale })
        break
      }

      case 'collection': {
        const isNew = !entry.id
        const id = entry.id ?? generateEntryId()
        const filePath = join(contentDir(projectRoot, model), `${locale}.json`)
        const existing = await readJson<Record<string, Record<string, unknown>>>(filePath) ?? {}

        const action: 'created' | 'updated' = (isNew || !(id in existing)) ? 'created' : 'updated'
        existing[id] = entry.data

        // Sort by entry ID for canonical output
        const sorted: Record<string, Record<string, unknown>> = {}
        for (const key of Object.keys(existing).toSorted()) {
          sorted[key] = existing[key]!
        }

        await writeJson(filePath, sorted)
        await writeMeta(projectRoot, model, { locale, entryId: id }, defaultMeta())
        results.push({ action, id, locale })
        break
      }

      case 'document': {
        const slug = entry.slug ?? entry.data['slug'] as string
        if (!slug) throw new Error('Document entries require a slug')

        const bodyContent = (entry.data['body'] as string) ?? ''
        const fmData = { ...entry.data }
        delete fmData['body']
        if (!fmData['slug']) fmData['slug'] = slug

        // Check if existing
        const existingRaw = await readText(join(contentDir(projectRoot, model), slug, `${locale}.md`))
        const action: 'created' | 'updated' = existingRaw ? 'updated' : 'created'

        const mdContent = serializeFrontmatter(fmData, bodyContent)
        await writeText(join(contentDir(projectRoot, model), slug, `${locale}.md`), mdContent)
        await writeMeta(projectRoot, model, { locale, slug }, defaultMeta())
        results.push({ action, slug, locale })
        break
      }

      case 'dictionary': {
        const filePath = join(contentDir(projectRoot, model), `${locale}.json`)
        const existing = await readJson<Record<string, string>>(filePath) ?? {}
        const merged = { ...existing, ...entry.data as Record<string, string> }
        await writeJson(filePath, merged)
        await writeMeta(projectRoot, model, { locale }, defaultMeta())
        results.push({ action: 'updated', locale })
        break
      }
    }
  }

  return results
}

// ─── deleteContent ───

export async function deleteContent(
  projectRoot: string,
  model: ModelDefinition,
  opts: DeleteOpts,
): Promise<string[]> {
  const removed: string[] = []
  const cDir = contentDir(projectRoot, model)

  switch (model.kind) {
    case 'collection': {
      if (!opts.id) throw new Error('Collection delete requires an entry ID')
      const locales = opts.locale
        ? [opts.locale]
        : (await readDir(cDir)).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))

      for (const loc of locales) {
        const filePath = join(cDir, `${loc}.json`)
        const data = await readJson<Record<string, unknown>>(filePath)
        if (data && opts.id in data) {
          delete data[opts.id]
          await writeJson(filePath, data)
          removed.push(`content/${model.domain}/${model.id}/${loc}.json#${opts.id}`)
        }
      }

      await deleteMeta(projectRoot, model, { locale: opts.locale, entryId: opts.id })
      break
    }

    case 'document': {
      if (!opts.slug) throw new Error('Document delete requires a slug')
      const slugDir = join(cDir, opts.slug)
      await rm(slugDir, { recursive: true, force: true })
      removed.push(`content/${model.domain}/${model.id}/${opts.slug}/`)

      await deleteMeta(projectRoot, model, { slug: opts.slug, locale: opts.locale })
      break
    }

    case 'singleton':
    case 'dictionary': {
      if (!opts.locale) throw new Error(`${model.kind} delete requires a locale`)
      const filePath = join(cDir, `${opts.locale}.json`)
      await rm(filePath, { force: true })
      removed.push(`content/${model.domain}/${model.id}/${opts.locale}.json`)

      await deleteMeta(projectRoot, model, { locale: opts.locale })
      break
    }
  }

  return removed
}

// ─── listContent ───

export async function listContent(
  projectRoot: string,
  model: ModelDefinition,
  opts: ListOpts,
  config: ContentrainConfig,
): Promise<unknown> {
  const cDir = contentDir(projectRoot, model)
  const locale = opts.locale ?? config.locales.default

  switch (model.kind) {
    case 'singleton': {
      const data = await readJson<Record<string, unknown>>(join(cDir, `${locale}.json`))
      return { kind: 'singleton', data: data ?? {}, locale }
    }

    case 'collection': {
      const data = await readJson<Record<string, Record<string, unknown>>>(join(cDir, `${locale}.json`)) ?? {}
      let entries: Array<Record<string, unknown>> = Object.entries(data).map(([id, fields]) => ({ id, ...fields }))

      // Filter
      if (opts.filter) {
        entries = entries.filter(entry => {
          for (const [key, value] of Object.entries(opts.filter!)) {
            if (entry[key] !== value) return false
          }
          return true
        })
      }

      const total = entries.length

      // Pagination
      const offset = opts.offset ?? 0
      const limit = opts.limit ?? entries.length
      entries = entries.slice(offset, offset + limit)

      // Resolve relations
      if (opts.resolve && model.fields) {
        entries = await resolveRelations(projectRoot, model, entries, locale)
      }

      return { kind: 'collection', data: entries, total, locale, offset, limit }
    }

    case 'document': {
      const slugDirs = await readDir(cDir)
      const entries: Array<{ slug: string; frontmatter: Record<string, unknown> }> = []

      for (const slug of slugDirs) {
        const raw = await readText(join(cDir, slug, `${locale}.md`))
        if (!raw) continue
        const { frontmatter } = parseFrontmatter(raw)
        entries.push({ slug, frontmatter })
      }

      const total = entries.length
      const offset = opts.offset ?? 0
      const limit = opts.limit ?? entries.length
      const paged = entries.slice(offset, offset + limit)

      return { kind: 'document', data: paged, total, locale, offset, limit }
    }

    case 'dictionary': {
      const data = await readJson<Record<string, string>>(join(cDir, `${locale}.json`)) ?? {}
      return { kind: 'dictionary', data, total_keys: Object.keys(data).length, locale }
    }
  }
}

// ─── readContent (for external use / relation resolving) ───

export async function readContent(
  projectRoot: string,
  model: ModelDefinition,
  opts: { locale: string; entryId?: string; slug?: string },
): Promise<unknown> {
  const cDir = contentDir(projectRoot, model)

  switch (model.kind) {
    case 'singleton':
      return readJson<Record<string, unknown>>(join(cDir, `${opts.locale}.json`))

    case 'collection': {
      if (!opts.entryId) return null
      const data = await readJson<Record<string, Record<string, unknown>>>(join(cDir, `${opts.locale}.json`))
      return data?.[opts.entryId] ? { id: opts.entryId, ...data[opts.entryId] } : null
    }

    case 'document': {
      if (!opts.slug) return null
      const raw = await readText(join(cDir, opts.slug, `${opts.locale}.md`))
      if (!raw) return null
      const { frontmatter, body } = parseFrontmatter(raw)
      return { slug: opts.slug, ...frontmatter, body }
    }

    case 'dictionary':
      return readJson<Record<string, string>>(join(cDir, `${opts.locale}.json`))
  }
}

// ─── Relation resolving ───

async function resolveRelations(
  projectRoot: string,
  model: ModelDefinition,
  entries: Array<Record<string, unknown>>,
  locale: string,
): Promise<Array<Record<string, unknown>>> {
  if (!model.fields) return entries

  const relationFields: Array<{ name: string; targetModels: string[]; multi: boolean }> = []
  for (const [name, field] of Object.entries(model.fields)) {
    if (field.type === 'relation' || field.type === 'relations') {
      const targets = Array.isArray(field.model) ? field.model : field.model ? [field.model] : []
      relationFields.push({ name, targetModels: targets, multi: field.type === 'relations' })
    }
  }

  if (relationFields.length === 0) return entries

  // Load target model contents into cache
  const targetCache: Record<string, Record<string, Record<string, unknown>>> = {}

  for (const rf of relationFields) {
    for (const targetModelId of rf.targetModels) {
      if (targetCache[targetModelId]) continue
      const targetModel = await readModel(projectRoot, targetModelId)
      if (!targetModel || targetModel.kind !== 'collection') continue

      const targetData = await readJson<Record<string, Record<string, unknown>>>(
        join(contentrainDir(projectRoot), 'content', targetModel.domain, targetModel.id, `${locale}.json`),
      ) ?? {}

      targetCache[targetModelId] = targetData
    }
  }

  return entries.map(entry => {
    const resolved = { ...entry }
    for (const rf of relationFields) {
      const value = resolved[rf.name]
      if (!value) continue

      if (rf.multi && Array.isArray(value)) {
        resolved[rf.name] = value.map(id => {
          for (const targetModelId of rf.targetModels) {
            const cached = targetCache[targetModelId]?.[id as string]
            if (cached) return { id, ...cached }
          }
          return id
        })
      } else if (typeof value === 'string') {
        for (const targetModelId of rf.targetModels) {
          const cached = targetCache[targetModelId]?.[value]
          if (cached) {
            resolved[rf.name] = { id: value, ...cached }
            break
          }
        }
      }
    }
    return resolved
  })
}
