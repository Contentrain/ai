import type { ModelDefinition, ContentrainConfig, EntryMeta, LocaleStrategy, DocumentEntry } from '@contentrain/types'
import { validateSlug, validateEntryId, validateLocale, generateEntryId, parseMarkdownFrontmatter, serializeMarkdownFrontmatter } from '@contentrain/types'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { contentrainDir, readDir, readJson, readText, writeJson, writeText } from '../util/fs.js'
import { writeMeta, deleteMeta } from './meta-manager.js'
import { readModel } from './model-manager.js'

// Re-export for backward compatibility (MCP internal consumers)
export { validateSlug, validateEntryId, validateLocale }
export { parseMarkdownFrontmatter as parseFrontmatter, serializeMarkdownFrontmatter as serializeFrontmatter } from '@contentrain/types'

// ─── Content paths ───

export function resolveContentDir(projectRoot: string, model: ModelDefinition): string {
  if (model.content_path) {
    return join(projectRoot, model.content_path)
  }
  return join(contentrainDir(projectRoot), 'content', model.domain, model.id)
}

export function resolveLocaleStrategy(model: ModelDefinition): LocaleStrategy {
  return model.locale_strategy ?? 'file'
}

/** Build the file path for a JSON content file (singleton/collection/dictionary) */
export function resolveJsonFilePath(dir: string, model: ModelDefinition, locale: string): string {
  // When i18n is disabled, always use data.json (locale parameter is ignored)
  if (!model.i18n) return join(dir, 'data.json')

  switch (resolveLocaleStrategy(model)) {
    case 'suffix': return join(dir, `${model.id}.${locale}.json`)
    case 'directory': return join(dir, locale, `${model.id}.json`)
    case 'none': return join(dir, `${model.id}.json`)
    case 'file':
    default: return join(dir, `${locale}.json`)
  }
}

/** Build the file path for a markdown document */
export function resolveMdFilePath(dir: string, model: ModelDefinition, locale: string, slug: string): string {
  // When i18n is disabled, always use {slug}.md (locale parameter is ignored)
  if (!model.i18n) return join(dir, `${slug}.md`)

  switch (resolveLocaleStrategy(model)) {
    case 'suffix': return join(dir, `${slug}.${locale}.md`)
    case 'directory': return join(dir, locale, `${slug}.md`)
    case 'none': return join(dir, `${slug}.md`)
    case 'file':
    default: return join(dir, slug, `${locale}.md`)
  }
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
  keys?: string[]
}

export interface ListOpts {
  locale?: string
  filter?: Record<string, unknown>
  resolve?: boolean
  limit?: number
  offset?: number
}

// ─── Default meta ───

function defaultMeta(data?: Record<string, unknown>): EntryMeta {
  const meta: EntryMeta = {
    status: 'draft',
    source: 'agent',
    updated_by: 'contentrain-mcp',
  }
  if (data?.['publish_at'] !== undefined) {
    meta.publish_at = data['publish_at'] as string
  }
  if (data?.['expire_at'] !== undefined) {
    meta.expire_at = data['expire_at'] as string
  }
  return meta
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

    // Validate locale
    const localeErr = validateLocale(locale, config)
    if (localeErr) throw new Error(localeErr)

    // Validate entry ID if provided
    if (entry.id) {
      const idErr = validateEntryId(entry.id)
      if (idErr) throw new Error(idErr)
    }

    // Validate slug if provided
    if (entry.slug) {
      const slugErr = validateSlug(entry.slug)
      if (slugErr) throw new Error(slugErr)
    }

    switch (model.kind) {
      case 'singleton': {
        const filePath = resolveJsonFilePath(resolveContentDir(projectRoot, model), model, locale)
        await writeJson(filePath, entry.data)
        await writeMeta(projectRoot, model, { locale }, defaultMeta(entry.data))
        results.push({ action: 'updated', locale })
        break
      }

      case 'collection': {
        const isNew = !entry.id
        const id = entry.id ?? generateEntryId()
        const filePath = resolveJsonFilePath(resolveContentDir(projectRoot, model), model, locale)
        const existing = await readJson<Record<string, Record<string, unknown>>>(filePath) ?? {}

        const action: 'created' | 'updated' = (isNew || !(id in existing)) ? 'created' : 'updated'
        existing[id] = entry.data

        // Sort by entry ID for canonical output
        const sorted: Record<string, Record<string, unknown>> = {}
        for (const key of Object.keys(existing).toSorted()) {
          sorted[key] = existing[key]!
        }

        await writeJson(filePath, sorted)
        await writeMeta(projectRoot, model, { locale, entryId: id }, defaultMeta(entry.data))
        results.push({ action, id, locale })
        break
      }

      case 'document': {
        const slug = entry.slug ?? entry.data['slug'] as string
        if (!slug) throw new Error('Document entries require a slug')
        const slugErr = validateSlug(slug)
        if (slugErr) throw new Error(slugErr)

        const bodyContent = (entry.data['body'] as string) ?? ''
        const fmData = { ...entry.data }
        delete fmData['body']
        if (!fmData['slug']) fmData['slug'] = slug

        // Check if existing
        const docPath = resolveMdFilePath(resolveContentDir(projectRoot, model), model, locale, slug)
        const existingRaw = await readText(docPath)
        const action: 'created' | 'updated' = existingRaw ? 'updated' : 'created'

        const mdContent = serializeMarkdownFrontmatter(fmData, bodyContent)
        await writeText(docPath, mdContent)
        await writeMeta(projectRoot, model, { locale, slug }, defaultMeta(entry.data))
        results.push({ action, slug, locale })
        break
      }

      case 'dictionary': {
        const filePath = resolveJsonFilePath(resolveContentDir(projectRoot, model), model, locale)
        const existing = await readJson<Record<string, string>>(filePath) ?? {}
        const collisions: string[] = []
        for (const key of Object.keys(entry.data as Record<string, string>)) {
          if (key in existing && existing[key] !== (entry.data as Record<string, string>)[key]) {
            collisions.push(key)
          }
        }
        if (collisions.length > 0) {
          throw new Error(
            `Dictionary "${model.id}" (${locale}): ${collisions.length} key collision(s) — [${collisions.join(', ')}] already exist with different values. ` +
            `Read existing keys with contentrain_content_list first, or include all keys in a single save call.`,
          )
        }
        const merged = { ...existing, ...entry.data as Record<string, string> }
        await writeJson(filePath, merged)
        await writeMeta(projectRoot, model, { locale }, defaultMeta(entry.data))
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
  const cDir = resolveContentDir(projectRoot, model)

  switch (model.kind) {
    case 'collection': {
      if (!opts.id) throw new Error('Collection delete requires an entry ID')
      const locales = opts.locale
        ? [opts.locale]
        : (await readDir(cDir)).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '').replace(`${model.id}.`, ''))

      for (const loc of locales) {
        const filePath = resolveJsonFilePath(cDir, model, loc)
        const data = await readJson<Record<string, unknown>>(filePath)
        if (data && opts.id in data) {
          delete data[opts.id]
          await writeJson(filePath, data)
          removed.push(`content/${model.domain}/${model.id}/${loc}.json#${opts.id}`)
        }
      }

      for (const loc of locales) {
        await deleteMeta(projectRoot, model, { locale: loc, entryId: opts.id })
      }
      break
    }

    case 'document': {
      if (!opts.slug) throw new Error('Document delete requires a slug')
      const slugDelErr = validateSlug(opts.slug)
      if (slugDelErr) throw new Error(slugDelErr)

      const strategy = resolveLocaleStrategy(model)
      if (!model.i18n) {
        // No i18n: single {slug}.md file
        await rm(join(cDir, `${opts.slug}.md`), { force: true })
      } else if (strategy === 'file') {
        // slug is a directory — remove entire slug directory
        await rm(join(cDir, opts.slug), { recursive: true, force: true })
      } else if (opts.locale) {
        // Remove specific locale file
        const filePath = resolveMdFilePath(cDir, model, opts.locale, opts.slug)
        await rm(filePath, { force: true })
      } else {
        // Remove all locale files for this slug
        const files = await readDir(strategy === 'directory' ? cDir : cDir)
        for (const f of files) {
          if (strategy === 'suffix' && f.startsWith(`${opts.slug}.`) && f.endsWith('.md')) {
            await rm(join(cDir, f), { force: true })
          } else if (strategy === 'directory') {
            // f is a locale dir — remove slug.md from it
            await rm(join(cDir, f, `${opts.slug}.md`), { force: true })
          } else if (strategy === 'none') {
            if (f === `${opts.slug}.md`) await rm(join(cDir, f), { force: true })
          }
        }
      }
      removed.push(`${model.content_path ?? `content/${model.domain}/${model.id}`}/${opts.slug}`)

      await deleteMeta(projectRoot, model, { slug: opts.slug, locale: opts.locale })
      break
    }

    case 'singleton': {
      if (model.i18n && !opts.locale) throw new Error('Singleton delete requires a locale when i18n is enabled')
      const locale = opts.locale ?? 'data'
      const filePath = resolveJsonFilePath(cDir, model, locale)
      await rm(filePath, { force: true })
      removed.push(model.i18n
        ? `content/${model.domain}/${model.id}/${locale}.json`
        : `content/${model.domain}/${model.id}/data.json`)
      await deleteMeta(projectRoot, model, { locale: model.i18n ? locale : undefined })
      break
    }

    case 'dictionary': {
      if (model.i18n && !opts.locale) throw new Error('Dictionary delete requires a locale when i18n is enabled')
      const locale = opts.locale ?? 'data'
      const filePath = resolveJsonFilePath(cDir, model, locale)

      if (opts.keys?.length) {
        // Delete specific keys from dictionary
        const existing = await readJson<Record<string, string>>(filePath) ?? {}
        const notFound: string[] = []
        for (const key of opts.keys) {
          if (key in existing) {
            delete existing[key]
          } else {
            notFound.push(key)
          }
        }
        if (notFound.length > 0) {
          throw new Error(`Dictionary "${model.id}" (${locale}): keys not found — [${notFound.join(', ')}]`)
        }
        await writeJson(filePath, existing)
        removed.push(...opts.keys.map(k => `${model.id}/${locale}:${k}`))
      } else {
        // Delete entire locale file
        await rm(filePath, { force: true })
        removed.push(model.i18n
          ? `content/${model.domain}/${model.id}/${locale}.json`
          : `content/${model.domain}/${model.id}/data.json`)
        await deleteMeta(projectRoot, model, { locale: model.i18n ? locale : undefined })
      }
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
  const cDir = resolveContentDir(projectRoot, model)
  const locale = opts.locale ?? config.locales.default

  switch (model.kind) {
    case 'singleton': {
      const data = await readJson<Record<string, unknown>>(resolveJsonFilePath(cDir, model, locale))
      return { kind: 'singleton', data: data ?? {}, locale }
    }

    case 'collection': {
      const data = await readJson<Record<string, Record<string, unknown>>>(resolveJsonFilePath(cDir, model, locale)) ?? {}
      let entries: Array<Record<string, unknown>> = Object.entries(data).map(([id, fields]) => {
        const entry: Record<string, unknown> = { id }
        Object.assign(entry, fields)
        return entry
      })

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
      const entries: DocumentEntry[] = []
      const strategy = resolveLocaleStrategy(model)

      if (!model.i18n) {
        // No i18n: flat {slug}.md files, no locale in path
        const files = await readDir(cDir)
        for (const f of files) {
          if (!f.endsWith('.md')) continue
          const slug = f.replace('.md', '')
          const raw = await readText(join(cDir, f))
          if (!raw) continue
          const { frontmatter, body } = parseMarkdownFrontmatter(raw)
          entries.push({ slug, frontmatter, body })
        }
      } else if (strategy === 'file') {
        // Each slug is a subdirectory containing locale.md files
        const slugDirs = await readDir(cDir)
        for (const slug of slugDirs) {
          const raw = await readText(join(cDir, slug, `${locale}.md`))
          if (!raw) continue
          const { frontmatter, body } = parseMarkdownFrontmatter(raw)
          entries.push({ slug, frontmatter, body })
        }
      } else if (strategy === 'suffix') {
        // Files like {slug}.{locale}.md in flat directory
        const files = await readDir(cDir)
        const suffix = `.${locale}.md`
        for (const f of files) {
          if (!f.endsWith(suffix)) continue
          const slug = f.slice(0, -suffix.length)
          const raw = await readText(join(cDir, f))
          if (!raw) continue
          const { frontmatter, body } = parseMarkdownFrontmatter(raw)
          entries.push({ slug, frontmatter, body })
        }
      } else if (strategy === 'directory') {
        // Files in {locale}/ directory as {slug}.md
        const localeDir = join(cDir, locale)
        const files = await readDir(localeDir)
        for (const f of files) {
          if (!f.endsWith('.md')) continue
          const slug = f.replace('.md', '')
          const raw = await readText(join(localeDir, f))
          if (!raw) continue
          const { frontmatter, body } = parseMarkdownFrontmatter(raw)
          entries.push({ slug, frontmatter, body })
        }
      } else {
        // none — {slug}.md, no locale in filename
        const files = await readDir(cDir)
        for (const f of files) {
          if (!f.endsWith('.md')) continue
          const slug = f.replace('.md', '')
          const raw = await readText(join(cDir, f))
          if (!raw) continue
          const { frontmatter, body } = parseMarkdownFrontmatter(raw)
          entries.push({ slug, frontmatter, body })
        }
      }

      const total = entries.length
      const offset = opts.offset ?? 0
      const limit = opts.limit ?? entries.length
      const paged = entries.slice(offset, offset + limit)

      return { kind: 'document', data: paged, total, locale, offset, limit }
    }

    case 'dictionary': {
      const data = await readJson<Record<string, string>>(resolveJsonFilePath(cDir, model, locale)) ?? {}
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
  const cDir = resolveContentDir(projectRoot, model)

  switch (model.kind) {
    case 'singleton':
      return readJson<Record<string, unknown>>(resolveJsonFilePath(cDir, model, opts.locale))

    case 'collection': {
      if (!opts.entryId) return null
      const data = await readJson<Record<string, Record<string, unknown>>>(resolveJsonFilePath(cDir, model, opts.locale))
      return data?.[opts.entryId] ? { id: opts.entryId, ...data[opts.entryId] } : null
    }

    case 'document': {
      if (!opts.slug) return null
      const raw = await readText(resolveMdFilePath(cDir, model, opts.locale, opts.slug))
      if (!raw) return null
      const { frontmatter, body } = parseMarkdownFrontmatter(raw)
      return { slug: opts.slug, ...frontmatter, body }
    }

    case 'dictionary':
      return readJson<Record<string, string>>(resolveJsonFilePath(cDir, model, opts.locale))
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

  // Load target model contents into cache (with circular reference protection)
  const targetCache: Record<string, Record<string, Record<string, unknown>>> = {}
  const visited = new Set<string>([model.id])

  for (const rf of relationFields) {
    for (const targetModelId of rf.targetModels) {
      if (targetCache[targetModelId] || visited.has(targetModelId)) continue
      visited.add(targetModelId)

      const targetModel = await readModel(projectRoot, targetModelId)
      if (!targetModel) continue

      if (targetModel.kind === 'collection') {
        const targetData = await readJson<Record<string, Record<string, unknown>>>(
          resolveJsonFilePath(resolveContentDir(projectRoot, targetModel), targetModel, locale),
        ) ?? {}
        targetCache[targetModelId] = targetData
      } else if (targetModel.kind === 'document') {
        // Build slug-keyed cache by listing document entries for this locale
        const docCache: Record<string, Record<string, unknown>> = {}
        const cDir = resolveContentDir(projectRoot, targetModel)
        const strategy = resolveLocaleStrategy(targetModel)

        if (!targetModel.i18n) {
          const files = await readDir(cDir)
          for (const f of files) {
            if (!f.endsWith('.md')) continue
            const slug = f.replace('.md', '')
            const raw = await readText(join(cDir, f))
            if (!raw) continue
            const { frontmatter, body } = parseMarkdownFrontmatter(raw)
            docCache[slug] = { slug, ...frontmatter, body }
          }
        } else if (strategy === 'file') {
          const slugDirs = await readDir(cDir)
          for (const slug of slugDirs) {
            const raw = await readText(join(cDir, slug, `${locale}.md`))
            if (!raw) continue
            const { frontmatter, body } = parseMarkdownFrontmatter(raw)
            docCache[slug] = { slug, ...frontmatter, body }
          }
        } else if (strategy === 'suffix') {
          const files = await readDir(cDir)
          const suffix = `.${locale}.md`
          for (const f of files) {
            if (!f.endsWith(suffix)) continue
            const slug = f.slice(0, -suffix.length)
            const raw = await readText(join(cDir, f))
            if (!raw) continue
            const { frontmatter, body } = parseMarkdownFrontmatter(raw)
            docCache[slug] = { slug, ...frontmatter, body }
          }
        } else if (strategy === 'directory') {
          const localeDir = join(cDir, locale)
          const files = await readDir(localeDir)
          for (const f of files) {
            if (!f.endsWith('.md')) continue
            const slug = f.replace('.md', '')
            const raw = await readText(join(localeDir, f))
            if (!raw) continue
            const { frontmatter, body } = parseMarkdownFrontmatter(raw)
            docCache[slug] = { slug, ...frontmatter, body }
          }
        } else {
          // 'none' strategy
          const files = await readDir(cDir)
          for (const f of files) {
            if (!f.endsWith('.md')) continue
            const slug = f.replace('.md', '')
            const raw = await readText(join(cDir, f))
            if (!raw) continue
            const { frontmatter, body } = parseMarkdownFrontmatter(raw)
            docCache[slug] = { slug, ...frontmatter, body }
          }
        }

        targetCache[targetModelId] = docCache
      }
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
