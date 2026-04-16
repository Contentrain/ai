import type { EntryMeta, ModelDefinition } from '@contentrain/types'
import { validateSlug } from '@contentrain/types'
import type { FileChange, RepoReader } from '../contracts/index.js'
import { canonicalStringify } from '../serialization/index.js'
import { contentFilePath, documentFilePath, metaFilePath } from './paths.js'
import type { OpPlan } from './types.js'

export interface ContentDeleteInput {
  model: ModelDefinition
  id?: string
  slug?: string
  locale?: string
  keys?: string[]
}

export type ContentDeletePlan = OpPlan<string[]>

function contentDir(model: Pick<ModelDefinition, 'domain' | 'id' | 'content_path'>): string {
  return model.content_path ?? `.contentrain/content/${model.domain}/${model.id}`
}

async function tryReadJson<T>(reader: RepoReader, path: string): Promise<T | null> {
  try {
    return JSON.parse(await reader.readFile(path)) as T
  } catch {
    return null
  }
}

async function discoverCollectionLocales(
  reader: RepoReader,
  model: ModelDefinition,
): Promise<string[]> {
  const dir = contentDir(model)
  const files = await reader.listDirectory(dir)
  const strategy = model.locale_strategy ?? 'file'
  if (strategy === 'directory') {
    return files
  }
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', '').replace(`${model.id}.`, ''))
}

/**
 * Build the FileChange[] required to delete content. Pure — touches no disk.
 *
 * Semantics preserved from legacy `deleteContent`:
 * - Collection: remove the entry ID from each locale's content file and its
 *   meta file. Meta file is deleted outright if the removal empties it.
 * - Singleton: delete the locale's content + meta file (locale-scoped when
 *   i18n, non-i18n removes whatever meta lives under `.contentrain/meta/{id}/`).
 * - Dictionary: two modes — key-scoped removal updates the file in place,
 *   or locale-scoped removes the content + meta pair.
 * - Document: strategy-aware delete (file/suffix/directory/none), plus
 *   meta removal under `.contentrain/meta/{id}/{slug}/`.
 */
export async function planContentDelete(
  reader: RepoReader,
  input: ContentDeleteInput,
): Promise<ContentDeletePlan> {
  const { model } = input
  const changes: FileChange[] = []
  const removed: string[] = []

  switch (model.kind) {
    case 'collection': {
      if (!input.id) throw new Error('Collection delete requires an entry ID')

      const locales = input.locale
        ? [input.locale]
        : await discoverCollectionLocales(reader, model)

      for (const loc of locales) {
        const cPath = contentFilePath(model, loc)
        const data = await tryReadJson<Record<string, unknown>>(reader, cPath)
        if (!data || !(input.id in data)) continue
        delete data[input.id]
        const sorted: Record<string, unknown> = {}
        for (const k of Object.keys(data).toSorted()) sorted[k] = data[k]
        changes.push({ path: cPath, content: canonicalStringify(sorted) })
        removed.push(`content/${model.domain}/${model.id}/${loc}.json#${input.id}`)
      }

      for (const loc of locales) {
        const mPath = metaFilePath(model, loc)
        const meta = await tryReadJson<Record<string, EntryMeta>>(reader, mPath)
        if (!meta || !(input.id in meta)) continue
        delete meta[input.id]
        if (Object.keys(meta).length > 0) {
          changes.push({ path: mPath, content: canonicalStringify(meta) })
        } else {
          changes.push({ path: mPath, content: null })
        }
      }
      break
    }

    case 'singleton': {
      if (model.i18n && !input.locale) {
        throw new Error('Singleton delete requires a locale when i18n is enabled')
      }
      const locale = input.locale ?? 'data'
      const cPath = contentFilePath(model, locale)
      changes.push({ path: cPath, content: null })
      removed.push(model.i18n
        ? `content/${model.domain}/${model.id}/${locale}.json`
        : `content/${model.domain}/${model.id}/data.json`)

      if (model.i18n) {
        changes.push({ path: metaFilePath(model, locale), content: null })
      } else {
        await pushAllMetaForModel(reader, model.id, changes)
      }
      break
    }

    case 'dictionary': {
      if (model.i18n && !input.locale) {
        throw new Error('Dictionary delete requires a locale when i18n is enabled')
      }
      const locale = input.locale ?? 'data'
      const cPath = contentFilePath(model, locale)

      if (input.keys?.length) {
        const existing = (await tryReadJson<Record<string, string>>(reader, cPath)) ?? {}
        const notFound: string[] = []
        for (const key of input.keys) {
          if (key in existing) delete existing[key]
          else notFound.push(key)
        }
        if (notFound.length > 0) {
          throw new Error(`Dictionary "${model.id}" (${locale}): keys not found — [${notFound.join(', ')}]`)
        }
        changes.push({ path: cPath, content: canonicalStringify(existing) })
        removed.push(...input.keys.map(k => `${model.id}/${locale}:${k}`))
      } else {
        changes.push({ path: cPath, content: null })
        removed.push(model.i18n
          ? `content/${model.domain}/${model.id}/${locale}.json`
          : `content/${model.domain}/${model.id}/data.json`)
        if (model.i18n) {
          changes.push({ path: metaFilePath(model, locale), content: null })
        } else {
          await pushAllMetaForModel(reader, model.id, changes)
        }
      }
      break
    }

    case 'document': {
      if (!input.slug) throw new Error('Document delete requires a slug')
      const slugErr = validateSlug(input.slug)
      if (slugErr) throw new Error(slugErr)

      const dir = contentDir(model)
      const strategy = model.locale_strategy ?? 'file'

      if (!model.i18n) {
        changes.push({ path: `${dir}/${input.slug}.md`, content: null })
      } else if (strategy === 'file') {
        const slugDir = `${dir}/${input.slug}`
        const files = await reader.listDirectory(slugDir)
        for (const f of files) changes.push({ path: `${slugDir}/${f}`, content: null })
      } else if (input.locale) {
        changes.push({ path: documentFilePath(model, input.locale, input.slug), content: null })
      } else if (strategy === 'suffix') {
        const files = await reader.listDirectory(dir)
        for (const f of files) {
          if (f.startsWith(`${input.slug}.`) && f.endsWith('.md')) {
            changes.push({ path: `${dir}/${f}`, content: null })
          }
        }
      } else if (strategy === 'directory') {
        const subdirs = await reader.listDirectory(dir)
        for (const d of subdirs) {
          const filePath = `${dir}/${d}/${input.slug}.md`
          if (await reader.fileExists(filePath)) {
            changes.push({ path: filePath, content: null })
          }
        }
      } else if (strategy === 'none') {
        const files = await reader.listDirectory(dir)
        if (files.includes(`${input.slug}.md`)) {
          changes.push({ path: `${dir}/${input.slug}.md`, content: null })
        }
      }

      removed.push(`${model.content_path ?? `content/${model.domain}/${model.id}`}/${input.slug}`)

      const metaSlugDir = `.contentrain/meta/${model.id}/${input.slug}`
      if (input.locale) {
        changes.push({ path: `${metaSlugDir}/${input.locale}.json`, content: null })
      } else {
        const metaFiles = await reader.listDirectory(metaSlugDir)
        for (const f of metaFiles) changes.push({ path: `${metaSlugDir}/${f}`, content: null })
      }
      break
    }
  }

  changes.sort((a, b) => a.path.localeCompare(b.path))
  return { changes, result: removed, advisories: [] }
}

async function pushAllMetaForModel(reader: RepoReader, modelId: string, changes: FileChange[]): Promise<void> {
  const metaDir = `.contentrain/meta/${modelId}`
  const files = await reader.listDirectory(metaDir)
  for (const f of files) changes.push({ path: `${metaDir}/${f}`, content: null })
}
