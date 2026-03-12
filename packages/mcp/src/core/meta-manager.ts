import type { ModelDefinition, EntryMeta } from '@contentrain/types'
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { contentrainDir, readJson, writeJson } from '../util/fs.js'

interface MetaOpts {
  locale?: string
  entryId?: string
  slug?: string
}

function metaPath(projectRoot: string, model: ModelDefinition, opts: MetaOpts): string {
  const base = join(contentrainDir(projectRoot), 'meta', model.id)

  if (model.kind === 'document' && opts.slug) {
    return join(base, opts.slug, `${opts.locale ?? 'en'}.json`)
  }

  return join(base, `${opts.locale ?? 'en'}.json`)
}

export async function readMeta(
  projectRoot: string,
  model: ModelDefinition,
  opts: MetaOpts,
): Promise<EntryMeta | Record<string, EntryMeta> | null> {
  return readJson(metaPath(projectRoot, model, opts))
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
  }
}
