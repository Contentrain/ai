import type { ContentrainConfig, EntryMeta, ModelDefinition, Vocabulary } from '@contentrain/types'
import { generateEntryId, validateEntryId, validateLocale, validateSlug } from '@contentrain/types'
import type { FileChange, RepoReader } from '../contracts/index.js'
import type { ContentEntry } from '../content-manager.js'
import { canonicalStringify, serializeMarkdownFrontmatter } from '../serialization/index.js'
import type { ContentSaveEntryResult, ContentSavePlan } from './types.js'
import { contentFilePath, documentFilePath, metaFilePath } from './paths.js'

interface PlanInput {
  model: ModelDefinition
  entries: ContentEntry[]
  config: ContentrainConfig
  vocabulary?: Vocabulary | null
}

/**
 * Build the FileChange[] required to save a batch of content entries. The
 * plan is deterministic, pure, and does not touch disk — it reads existing
 * state through `reader` and returns changes for a single atomic commit.
 *
 * Grouping: multiple entries targeting the same (model, locale) share a
 * single content file and a single meta file. Reads are cached in-memory
 * so repeated reads of the same path during a plan are one IO.
 */
export async function planContentSave(reader: RepoReader, input: PlanInput): Promise<ContentSavePlan> {
  const { model, entries, config, vocabulary } = input
  const result: ContentSaveEntryResult[] = []
  const advisories: string[] = []

  // In-memory accumulators keyed by content-root-relative path.
  const contentByPath = new Map<string, unknown>()
  const metaByPath = new Map<string, unknown>()
  const markdownChanges = new Map<string, string>()

  async function readJsonOrEmpty<T>(path: string): Promise<T> {
    try {
      return JSON.parse(await reader.readFile(path)) as T
    } catch {
      return {} as T
    }
  }

  const defaultLocale = config.locales.default

  for (const entry of entries) {
    const locale = entry.locale ?? defaultLocale

    const localeErr = validateLocale(locale, config)
    if (localeErr) throw new Error(localeErr)
    if (entry.id) {
      const err = validateEntryId(entry.id)
      if (err) throw new Error(err)
    }
    if (entry.slug) {
      const err = validateSlug(entry.slug)
      if (err) throw new Error(err)
    }

    switch (model.kind) {
      case 'singleton': {
        const cPath = contentFilePath(model, locale)
        const mPath = metaFilePath(model, locale)
        contentByPath.set(cPath, entry.data)
        metaByPath.set(mPath, defaultMeta(entry.data))
        result.push({ action: 'updated', locale })
        break
      }

      case 'collection': {
        const isNew = !entry.id
        const id = entry.id ?? generateEntryId()
        const cPath = contentFilePath(model, locale)
        const mPath = metaFilePath(model, locale)

        const existing = (contentByPath.get(cPath) as Record<string, unknown> | undefined)
          ?? await readJsonOrEmpty<Record<string, unknown>>(cPath)

        const action: 'created' | 'updated' = isNew || !(id in existing) ? 'created' : 'updated'
        existing[id] = entry.data

        const sorted: Record<string, unknown> = {}
        for (const key of Object.keys(existing).toSorted()) {
          sorted[key] = existing[key]
        }
        contentByPath.set(cPath, sorted)

        const existingMeta = (metaByPath.get(mPath) as Record<string, EntryMeta> | undefined)
          ?? await readJsonOrEmpty<Record<string, EntryMeta>>(mPath)
        existingMeta[id] = defaultMeta(entry.data)
        metaByPath.set(mPath, existingMeta)

        result.push({ action, id, locale })
        break
      }

      case 'dictionary': {
        const cPath = contentFilePath(model, locale)
        const mPath = metaFilePath(model, locale)

        const existing = (contentByPath.get(cPath) as Record<string, string> | undefined)
          ?? await readJsonOrEmpty<Record<string, string>>(cPath)

        const newData = entry.data as Record<string, string>
        const collisions = Object.keys(newData).filter(
          k => k in existing && existing[k] !== newData[k],
        )
        if (collisions.length > 0) {
          throw new Error(
            `Dictionary "${model.id}" (${locale}): ${collisions.length} key collision(s) — [${collisions.join(', ')}] already exist with different values. `
            + 'Read existing keys with contentrain_content_list first, or include all keys in a single save call.',
          )
        }

        const entryAdvisories: string[] = []
        const reverseMap = new Map<string, string>()
        for (const [k, v] of Object.entries(existing)) reverseMap.set(v, k)
        for (const [newKey, newValue] of Object.entries(newData)) {
          if (newKey in existing) continue
          const existingKey = reverseMap.get(newValue)
          if (existingKey && existingKey !== newKey) {
            entryAdvisories.push(
              `Value "${newValue}" already exists as key "${existingKey}". Consider reusing instead of creating "${newKey}".`,
            )
          }
        }

        if (vocabulary && Object.keys(vocabulary.terms).length > 0) {
          outer:
          for (const [newKey, newValue] of Object.entries(newData)) {
            if (newKey in existing) continue
            for (const translations of Object.values(vocabulary.terms)) {
              if (Object.values(translations).includes(newValue)) {
                entryAdvisories.push(
                  `Value "${newValue}" matches a vocabulary term. Use the canonical form for consistency.`,
                )
                continue outer
              }
            }
          }
        }

        advisories.push(...entryAdvisories)

        contentByPath.set(cPath, { ...existing, ...newData })
        metaByPath.set(mPath, defaultMeta(entry.data))

        result.push({
          action: 'updated',
          locale,
          ...(entryAdvisories.length > 0 ? { advisories: entryAdvisories } : {}),
        })
        break
      }

      case 'document': {
        const slug = entry.slug ?? (entry.data['slug'] as string | undefined)
        if (!slug) throw new Error('Document entries require a slug')
        const slugErr = validateSlug(slug)
        if (slugErr) throw new Error(slugErr)

        const fmData = { ...entry.data }
        const bodyContent = (fmData['body'] as string | undefined) ?? ''
        delete fmData['body']
        if (!fmData['slug']) fmData['slug'] = slug

        const dPath = documentFilePath(model, locale, slug)
        const mPath = metaFilePath(model, locale, slug)

        let existingRaw: string | null = null
        try { existingRaw = await reader.readFile(dPath) }
        catch { /* not yet */ }
        const action: 'created' | 'updated' = existingRaw ? 'updated' : 'created'

        markdownChanges.set(dPath, serializeMarkdownFrontmatter(fmData, bodyContent))
        metaByPath.set(mPath, defaultMeta(entry.data))

        result.push({ action, slug, locale })
        break
      }
    }
  }

  const changes: FileChange[] = []
  for (const [path, data] of contentByPath) {
    changes.push({ path, content: canonicalStringify(data) })
  }
  for (const [path, meta] of metaByPath) {
    changes.push({ path, content: canonicalStringify(meta) })
  }
  for (const [path, content] of markdownChanges) {
    changes.push({ path, content })
  }
  changes.sort((a, b) => a.path.localeCompare(b.path))

  return { changes, result, advisories }
}

function defaultMeta(data?: Record<string, unknown>): EntryMeta {
  const meta: EntryMeta = {
    status: 'draft',
    source: 'agent',
    updated_by: 'contentrain-mcp',
  }
  if (data?.['publish_at'] !== undefined) meta.publish_at = data['publish_at'] as string
  if (data?.['expire_at'] !== undefined) meta.expire_at = data['expire_at'] as string
  return meta
}
