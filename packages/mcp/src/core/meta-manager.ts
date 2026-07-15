import type { ModelDefinition, EntryMeta } from '@contentrain/types'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { contentrainDir, readJson, writeJson } from '../util/fs.js'

interface MetaOpts {
  locale?: string
  entryId?: string
  slug?: string
  /**
   * `config.locales.default`. Required: it places a non-i18n model's single
   * meta record, and stands in for an omitted locale on i18n models — the old
   * hardcoded `'en'` fallback silently wrote to the wrong file on projects
   * whose default was anything else.
   */
  defaultLocale: string
}

/**
 * Absolute meta path. Non-i18n models keep exactly one meta record, pinned to
 * the default locale — see `ops/paths.ts:metaFilePath` for the full rationale.
 */
function metaPath(projectRoot: string, model: ModelDefinition, opts: MetaOpts): string {
  const base = join(contentrainDir(projectRoot), 'meta', model.id)
  const effective = model.i18n ? (opts.locale ?? opts.defaultLocale) : opts.defaultLocale

  if (model.kind === 'document' && opts.slug) {
    return join(base, opts.slug, `${effective}.json`)
  }

  return join(base, `${effective}.json`)
}

export async function readMeta(
  projectRoot: string,
  model: ModelDefinition,
  opts: MetaOpts,
): Promise<EntryMeta | Record<string, EntryMeta> | null> {
  return readJson(metaPath(projectRoot, model, opts))
}

/**
 * Build the meta for a content write, merged over the entry's existing meta.
 *
 * `status` is a publish decision and belongs to whoever made it — editing a
 * field must not unpublish an entry. Only an entry with no meta yet starts at
 * `draft`. `source`/`updated_by` describe *this* write, so they are stamped
 * every time; `approved_by`/`version` survive via the spread.
 *
 * Pass `existing: undefined` to mint meta for a genuinely new entry.
 */
export function mergeEntryMeta(
  existing: EntryMeta | undefined,
  data?: Record<string, unknown>,
): EntryMeta {
  const meta: EntryMeta = {
    ...existing,
    status: existing?.status ?? 'draft',
    source: 'agent',
    updated_by: 'contentrain-mcp',
  }
  if (data?.['publish_at'] !== undefined) meta.publish_at = data['publish_at'] as string
  if (data?.['expire_at'] !== undefined) meta.expire_at = data['expire_at'] as string
  return meta
}

export async function writeMeta(
  projectRoot: string,
  model: ModelDefinition,
  opts: MetaOpts,
  meta: EntryMeta,
): Promise<void> {
  const filePath = metaPath(projectRoot, model, opts)

  if (model.kind === 'collection' && opts.entryId) {
    const existing = await readJson<Record<string, EntryMeta>>(filePath) ?? {}
    existing[opts.entryId] = meta
    await writeJson(filePath, existing)
  } else {
    await writeJson(filePath, meta)
  }
}

/**
 * Apply many entry-meta updates to one collection locale file in a single
 * read-modify-write, returning the entry IDs actually written.
 *
 * Do NOT loop `writeMeta` over entry IDs: every call rewrites the whole shared
 * `{locale}.json`, so concurrent calls each start from the same snapshot and
 * all but the last-settling one are silently lost. This function exists so that
 * race cannot be reintroduced.
 */
export async function writeMetaEntries(
  projectRoot: string,
  model: ModelDefinition,
  opts: MetaOpts,
  updates: Record<string, EntryMeta>,
): Promise<string[]> {
  const ids = Object.keys(updates)
  if (ids.length === 0) return []

  const filePath = metaPath(projectRoot, model, opts)
  const existing = await readJson<Record<string, EntryMeta>>(filePath) ?? {}
  await writeJson(filePath, { ...existing, ...updates })
  return ids
}

export async function deleteMeta(
  projectRoot: string,
  model: ModelDefinition,
  opts: MetaOpts,
): Promise<void> {
  if (model.kind === 'collection' && opts.entryId) {
    const filePath = metaPath(projectRoot, model, opts)
    const existing = await readJson<Record<string, EntryMeta>>(filePath)
    if (existing && opts.entryId in existing) {
      delete existing[opts.entryId]
      if (Object.keys(existing).length > 0) {
        await writeJson(filePath, existing)
      } else {
        await rm(filePath, { force: true })
      }
    }
  } else if (model.kind === 'document' && opts.slug) {
    const slugDir = join(contentrainDir(projectRoot), 'meta', model.id, opts.slug)
    if (opts.locale) {
      await rm(join(slugDir, `${opts.locale}.json`), { force: true })
    } else {
      try {
        await rm(slugDir, { recursive: true, force: true })
      } catch {
        // directory may not exist
      }
    }
  } else if (opts.locale) {
    const filePath = metaPath(projectRoot, model, opts)
    await rm(filePath, { force: true })
  } else {
    // No locale specified — remove all meta for this model (non-i18n or full cleanup)
    const metaDir = join(contentrainDir(projectRoot), 'meta', model.id)
    try {
      await rm(metaDir, { recursive: true, force: true })
    } catch {
      // directory may not exist
    }
  }
}
