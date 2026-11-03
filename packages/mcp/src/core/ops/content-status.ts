import type { ContentrainConfig, ContentStatus, EntryMeta, ModelDefinition } from '@contentrain/types'
import type { FileChange, RepoReader } from '../contracts/index.js'
import { canonicalStringify } from '../serialization/index.js'
import { applyStatusChange } from '../meta-manager.js'
import { metaFilePath } from './paths.js'
import type { OpPlan } from './types.js'

export interface ContentStatusInput {
  model: ModelDefinition
  status: ContentStatus
  /** Collection models: the entries to change. */
  entryIds?: string[]
  /** Document models: the documents to change, by slug. */
  slugs?: string[]
  /** i18n models only; omitted means every supported locale. */
  locale?: string
  config: ContentrainConfig
}

/** One record whose status this plan changes. Collections carry `id`, documents `slug`, singletons and dictionaries neither. */
export interface ContentStatusChange {
  id?: string
  slug?: string
  locale: string
  from: ContentStatus
  to: ContentStatus
}

/** A record that already has the requested status. It gets no write, so calling twice changes nothing. */
export interface ContentStatusUnchanged {
  id?: string
  slug?: string
  locale: string
  status: ContentStatus
}

export interface ContentStatusResult {
  changes: ContentStatusChange[]
  unchanged: ContentStatusUnchanged[]
  /** Requested entry IDs or slugs with no meta record in any target locale. */
  not_found: string[]
  /** The locales the plan looked in. */
  locales: string[]
}

export type ContentStatusPlan = OpPlan<ContentStatusResult>

async function readJsonOrNull<T>(reader: RepoReader, path: string): Promise<T | null> {
  try {
    return JSON.parse(await reader.readFile(path)) as T
  } catch {
    return null
  }
}

/**
 * Build the meta writes for a status change. Pure: it reads current meta
 * through `reader` and returns the changes for one atomic commit.
 *
 * Three meta layouts, three ways to address a record. Collections key meta by
 * entry ID in one file per locale; documents keep one file per slug
 * (meta/{model}/{slug}/{locale}.json) and are addressed by slug, as
 * content_save does; singletons and dictionaries have exactly one record per
 * locale and take no list. The caller checks that the input matches the kind.
 *
 * `from` is read from what is persisted, never assumed. A record already at
 * the requested status gets no write: `applyStatusChange` stamps `updated_at`,
 * so rewriting it would make a repeated call commit again.
 */
export async function planContentStatus(reader: RepoReader, input: ContentStatusInput): Promise<ContentStatusPlan> {
  const { model, status, config } = input
  const defaultLocale = config.locales.default

  // A non-i18n model stores one meta record at the default locale, so
  // fanning out over supported locales would rewrite the same file.
  const locales = model.i18n
    ? (input.locale ? [input.locale] : config.locales.supported)
    : [defaultLocale]

  // A key passed twice would read as changed, then as unchanged.
  const entryIds = [...new Set(input.entryIds ?? [])]
  const slugs = [...new Set(input.slugs ?? [])]

  const changes: FileChange[] = []
  const result: ContentStatusResult = { changes: [], unchanged: [], not_found: [], locales }
  const found = new Set<string>()

  for (const locale of locales) {
    if (model.kind === 'collection') {
      const path = metaFilePath(model, locale, defaultLocale)
      const metaMap = await readJsonOrNull<Record<string, EntryMeta>>(reader, path)
      if (!metaMap) continue
      let changed = false
      for (const id of entryIds) {
        const existing = metaMap[id]
        if (!existing) continue
        found.add(id)
        if (existing.status === status) {
          result.unchanged.push({ id, locale, status })
          continue
        }
        metaMap[id] = applyStatusChange(existing, status)
        result.changes.push({ id, locale, from: existing.status, to: status })
        changed = true
      }
      if (changed) changes.push({ path, content: canonicalStringify(metaMap) })
    } else if (model.kind === 'document') {
      for (const slug of slugs) {
        const path = metaFilePath(model, locale, defaultLocale, slug)
        const existing = await readJsonOrNull<EntryMeta>(reader, path)
        if (!existing) continue
        found.add(slug)
        if (existing.status === status) {
          result.unchanged.push({ slug, locale, status })
          continue
        }
        changes.push({ path, content: canonicalStringify(applyStatusChange(existing, status)) })
        result.changes.push({ slug, locale, from: existing.status, to: status })
      }
    } else {
      const path = metaFilePath(model, locale, defaultLocale)
      const existing = await readJsonOrNull<EntryMeta>(reader, path)
      if (!existing) continue
      if (existing.status === status) {
        result.unchanged.push({ locale, status })
        continue
      }
      changes.push({ path, content: canonicalStringify(applyStatusChange(existing, status)) })
      result.changes.push({ locale, from: existing.status, to: status })
    }
  }

  const requested = model.kind === 'collection' ? entryIds : model.kind === 'document' ? slugs : []
  result.not_found = requested.filter(key => !found.has(key))
  changes.sort((a, b) => a.path.localeCompare(b.path))

  return { changes, result, advisories: [] }
}
