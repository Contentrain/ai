// Astro content-layer loader for a `.contentrain` project.
//
// `contentrain generate` produces a typed client for application code; Astro
// wants its content in the content layer instead, so pages can query it with
// `getCollection()` and render documents with `<Content />`. This loader reads
// the same `.contentrain` files the generator reads — through the same manifest
// — so a project never has two answers about what its content is.
//
// Astro is NOT a dependency here, not even a peer: the returned object is
// structurally what `defineCollection({ loader })` accepts, and the context is
// typed by the small surface this loader actually uses. That keeps
// @contentrain/query dependency-free and usable from any Astro 5 version.

import { publicationContext, publicationMeta, isPublishedAt, type PublicationOptions, type PublicationContext } from '../generator/publication.js'
import type { ModelDefinition } from '@contentrain/types'
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ContentFileRef } from '../generator/config-reader.js'
import { readProjectManifest } from '../generator/config-reader.js'
import { readJson, readText } from '../generator/utils.js'
import { parseFrontmatter, stringLikeFieldKeys } from '../shared/frontmatter.js'

/** The slice of Astro's `LoaderContext` this loader uses. */
export interface ContentrainLoaderContext {
  store: {
    clear: () => void
    set: (entry: {
      id: string
      data: Record<string, unknown>
      body?: string
      digest?: string
      rendered?: { html: string, metadata?: Record<string, unknown> }
      filePath?: string
    }) => void
  }
  logger?: { info: (msg: string) => void, warn: (msg: string) => void }
  /** Astro's resolved config; only `root` is read, to make file paths relative. */
  config?: { root?: URL | string }
  generateDigest?: (data: unknown) => string
  parseData?: (entry: { id: string, data: Record<string, unknown>, filePath?: string }) => Promise<Record<string, unknown>>
  renderMarkdown?: (content: string) => Promise<{ html: string, metadata?: Record<string, unknown> }>
  watcher?: { add: (path: string) => void, on: (event: string, cb: (path: string) => void) => void }
}

/** Structurally Astro's `Loader`. */
export interface ContentrainLoader {
  name: string
  load: (context: ContentrainLoaderContext) => Promise<void>
}

export interface ContentrainLoaderOptions extends PublicationOptions {
  /** Model id — the `id` in `.contentrain/models/<id>.json`. */
  model: string
  /** Project root holding `.contentrain`. Default: `process.cwd()`. */
  root?: string
  /**
   * Load only this locale. Omitted on an i18n model, every supported locale is
   * loaded and entry ids are prefixed (`en/my-post`) so the two languages of one
   * post do not collide — Astro ids are unique per collection.
   */
  locale?: string
}

interface Entry {
  id: string
  data: Record<string, unknown>
  body?: string
  filePath: string
}

/**
 * A loader for one Contentrain model.
 *
 * ```ts
 * // src/content.config.ts
 * import { defineCollection } from 'astro:content'
 * import { contentrainLoader } from '@contentrain/query/astro'
 *
 * export const collections = {
 *   posts: defineCollection({ loader: contentrainLoader({ model: 'blog-post', locale: 'en' }) }),
 *   articles: defineCollection({ loader: contentrainLoader({ model: 'blog-article' }) }),
 * }
 * ```
 *
 * Each model kind maps to the shape Astro can actually use:
 * collection → one entry per record · document → one entry per file, markdown
 * in `body` (and rendered, so `<Content />` works) · dictionary → one entry per
 * key, because a single blob would make `getEntry()` useless · singleton → one
 * entry, id `<model>` or the locale.
 */
export function contentrainLoader(options: ContentrainLoaderOptions): ContentrainLoader {
  const root = options.root ?? process.cwd()
  let watching = false

  return {
    name: `contentrain:${options.model}`,
    async load(context) {
      const manifest = await readProjectManifest(root)
      const model = manifest.models.find(m => m.id === options.model)
      if (!model) {
        const known = manifest.models.map(m => m.id).join(', ') || 'none'
        throw new Error(
          `contentrainLoader: model "${options.model}" not found in ${join(root, '.contentrain', 'models')}. Models here: ${known}.`,
        )
      }

      const refs = manifest.contentFiles.filter(ref =>
        ref.modelId === model.id && (options.locale === undefined || ref.locale === options.locale),
      )
      if (options.locale !== undefined && refs.length === 0 && model.i18n) {
        context.logger?.warn(
          `contentrainLoader: model "${model.id}" has no content for locale "${options.locale}" — collection is empty.`,
        )
      }
      // Prefix ids only when one collection really holds several languages;
      // a single-locale load keeps the natural id so routes stay clean.
      const prefixLocale = model.i18n === true && options.locale === undefined

      const publication = publicationContext(root, manifest.config.locales.default, options)
      const perFile = await Promise.all(refs.map(ref => entriesOf(ref, model, prefixLocale, publication)))
      const entries = perFile.flat()
      // Astro rejects an absolute filePath ("must be relative to the site
      // root"), and a `.contentrain` outside the Astro root has no relative
      // form it accepts — there we send none rather than a path it refuses.
      const siteRoot = toPath(context.config?.root)

      context.store.clear()
      for (const entry of entries) {
        const data = context.parseData
          ? await context.parseData({ id: entry.id, data: entry.data, filePath: entry.filePath })
          : entry.data
        const filePath = siteRoot === undefined ? undefined : relative(siteRoot, entry.filePath)
        context.store.set({
          id: entry.id,
          data,
          ...(filePath === undefined || filePath.startsWith('..') || isAbsolute(filePath) ? {} : { filePath }),
          ...(entry.body === undefined ? {} : { body: entry.body }),
          ...(context.generateDigest ? { digest: context.generateDigest(entry.data) } : {}),
          ...(entry.body !== undefined && context.renderMarkdown
            ? { rendered: await context.renderMarkdown(entry.body) }
            : {}),
        })
      }
      context.logger?.info(`Loaded ${entries.length} ${model.kind} ${entries.length === 1 ? 'entry' : 'entries'} from ${model.id}`)

      // Dev server: reload when the files behind this collection change. The
      // listener is registered once — `load` runs again on every change, and a
      // listener per run would multiply the work on every save.
      if (context.watcher && !watching) {
        watching = true
        const paths = new Set(refs.map(ref => ref.filePath))
        for (const path of paths) context.watcher.add(path)
        const metaDir = join(root, '.contentrain', 'meta', model.id)
        context.watcher.add(metaDir)
        context.watcher.add(join(root, '.contentrain', 'models', `${model.id}.json`))
        const reload = (path: string) => {
          if (!paths.has(path) && !path.startsWith(metaDir + '/') && !path.endsWith(`${model.id}.json`)) return
          void this.load(context)
        }
        context.watcher.on('change', reload)
        context.watcher.on('add', reload)
        context.watcher.on('unlink', reload)
      }
    },
  }
}

/** Astro hands `config.root` as a file URL; tests and other hosts may use a path. */
function toPath(root: URL | string | undefined): string | undefined {
  if (root === undefined) return undefined
  if (typeof root !== 'string') return fileURLToPath(root)
  return root.startsWith('file:') ? fileURLToPath(root) : root
}

async function entriesOf(ref: ContentFileRef, model: ModelDefinition, prefixLocale: boolean, publication?: PublicationContext): Promise<Entry[]> {
  const meta = publication ? await publicationMeta(ref, model, publication) : undefined
  const visible = (id?: string) => !publication || isPublishedAt(id === undefined ? meta : meta?.[id], publication.at)
  if ((model.kind === 'singleton' || model.kind === 'document') && !visible()) return []
  const prefix = prefixLocale && ref.locale ? `${ref.locale}/` : ''
  const withLocale = (data: Record<string, unknown>): Record<string, unknown> =>
    ref.locale === null ? data : { ...data, locale: ref.locale }

  switch (ref.kind) {
    case 'collection': {
      const raw = await readJson<Record<string, Record<string, unknown>>>(ref.filePath)
      if (!raw) return []
      return Object.entries(raw)
        .filter(([id]) => visible(id))
        .toSorted(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([id, fields]) => ({
          id: `${prefix}${id}`,
          data: withLocale({ id, ...fields }),
          filePath: ref.filePath,
        }))
    }

    case 'singleton': {
      const raw = await readJson<Record<string, unknown>>(ref.filePath)
      if (!raw) return []
      return [{
        id: prefix ? `${ref.locale}` : model.id,
        data: withLocale(raw),
        filePath: ref.filePath,
      }]
    }

    case 'dictionary': {
      // One entry per key: a dictionary key is a semantic address, and a single
      // blob entry would make getEntry() and reference() useless on it.
      const raw = await readJson<Record<string, string>>(ref.filePath)
      if (!raw) return []
      return Object.entries(raw)
        .filter(([id]) => visible(id))
        .toSorted(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, value]) => ({
          id: `${prefix}${key}`,
          data: withLocale({ key, value }),
          filePath: ref.filePath,
        }))
    }

    case 'document': {
      const text = await readText(ref.filePath)
      if (text === null) return []
      const { frontmatter, body } = parseFrontmatter(text, stringLikeFieldKeys(model))
      const slug = ref.slug ?? model.id
      return [{
        id: `${prefix}${slug}`,
        data: withLocale({ slug, ...frontmatter }),
        body,
        filePath: ref.filePath,
      }]
    }

    default:
      return []
  }
}
